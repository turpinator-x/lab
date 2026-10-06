# Exercise 6 Results: Break/Fix -- Stale Static Route Masks BGP

Goal: show that a leftover static route overrides a correct BGP-learned route for the same prefix, because of route preference (administrative distance).

## Break it

Added a static route on srl1 for host2's network (`10.1.4.0/24`) pointing the wrong way, at srl3 (`10.1.3.2`). BGP correctly points it at srl2 (`10.1.2.2`).

```
$ docker exec -it clab-dynamic-routing-bgp-srl1 sr_cli
A:srl1# enter candidate
A:srl1# set / network-instance default next-hop-groups group nhg-wrong admin-state enable
A:srl1# set / network-instance default next-hop-groups group nhg-wrong nexthop 1 ip-address 10.1.3.2
A:srl1# set / network-instance default static-routes route 10.1.4.0/24 admin-state enable
A:srl1# set / network-instance default static-routes route 10.1.4.0/24 next-hop-group nhg-wrong
A:srl1# commit now
All changes have been committed. Leaving candidate mode.
```

## Symptom: works, but takes the wrong path

```
$ docker exec clab-dynamic-routing-bgp-host1 ping -c 3 -W 2 10.1.4.2
64 bytes from 10.1.4.2: icmp_seq=1 ttl=62 time=0.320 ms
64 bytes from 10.1.4.2: icmp_seq=2 ttl=62 time=0.315 ms
64 bytes from 10.1.4.2: icmp_seq=3 ttl=62 time=0.289 ms
3 packets transmitted, 3 received, 0% packet loss

$ docker exec clab-dynamic-routing-bgp-host1 traceroute -n -w 2 10.1.4.2
 1  10.1.1.1   <- srl1
 2  10.1.3.2   <- srl3   (wrong direction, following the static route)
 3  10.1.6.1   <- srl2   (srl3 passes it on over the srl2–srl3 link)
 4  10.1.4.2   <- host2

$ docker exec clab-dynamic-routing-bgp-host1 ping -c 3 10.1.5.2
3 packets transmitted, 3 received, 0% packet loss   (host3 unaffected, ttl=62)
```

The course README expects host1 → host2 to fail. It still works here because srl3 can forward the traffic to srl2 over the link added in Exercise 2, so the wrong route becomes a detour instead of a dead end.

**Asymmetric routing:** the traceroute shows the forward path crossing **3 routers** (srl1 → srl3 → srl2), but the ping replies arrive with `ttl=62`, which is **2 routers**. Ping's TTL measures the *reply*, and host2's reply goes back srl2 → srl1 directly using srl2's own (correct) BGP route. Traffic goes out one way and returns another.

## Diagnose

### Route table: the static route wins

```
$ docker exec clab-dynamic-routing-bgp-srl1 sr_cli -c "show network-instance default route-table ipv4-unicast summary"
| Prefix      | Route Type | Route Owner      | Pref | Next-hop (Type)              | Next-hop Interface |
|-------------|------------|------------------|------|------------------------------|--------------------|
| 10.1.4.0/24 | static     | static_route_mgr | 5    | 10.1.3.0/24 (indirect/local) | ethernet-1/3.0     |
| 10.1.5.0/24 | bgp        | bgp_mgr          | 170  | 10.1.3.0/24 (indirect/local) | ethernet-1/3.0     |
| 10.1.6.0/24 | bgp        | bgp_mgr          | 170  | 10.1.2.0/24 (indirect/local) | ethernet-1/2.0     |
IPv4 routes total : 12
```

(Local and host rows trimmed.) `10.1.4.0/24` is now type **static** with **Pref 5**, sending traffic out `ethernet-1/3` toward srl3 (next hop `10.1.3.2`).

### BGP sessions: all healthy

```
$ docker exec clab-dynamic-routing-bgp-srl1 sr_cli -c "show network-instance default protocols bgp neighbor"
| Peer     | Peer-AS | State       | [Rx/Active/Tx] |
|----------|---------|-------------|----------------|
| 10.1.2.2 | 65002   | established | [4/1/4]        |
| 10.1.3.2 | 65003   | established | [4/1/4]        |
```

All BGP sessions are still Established. Nothing is wrong with BGP itself.

### BGP table: the correct route is still there

```
$ docker exec clab-dynamic-routing-bgp-srl1 sr_cli -c "show network-instance default protocols bgp routes ipv4 summary"
Status codes: u=used, *=valid, >=best
| Status | Network     | Next Hop | Path Val            |
|--------|-------------|----------|---------------------|
| u*>    | 10.1.4.0/24 | 10.1.3.2 |  ?                  |   <- static route (origin ? = incomplete, not from BGP)
| *      | 10.1.4.0/24 | 10.1.2.2 | [65002] i           |   <- BGP's correct path via srl2: valid, NOT used
| *      | 10.1.4.0/24 | 10.1.3.2 | [65003, 65002] i    |
```

(Other prefixes trimmed.) BGP still learned the correct path (`[65002]` via srl2), but it's marked valid and not used: the static route has taken over the prefix. That's what "masks BGP" means.

## Fix

```
$ docker exec -it clab-dynamic-routing-bgp-srl1 sr_cli
A:srl1# enter candidate
A:srl1# delete / network-instance default static-routes route 10.1.4.0/24
A:srl1# delete / network-instance default next-hop-groups group nhg-wrong
A:srl1# commit now
All changes have been committed. Leaving candidate mode.
```

## Verify

```
$ docker exec clab-dynamic-routing-bgp-host1 ping -c 3 10.1.4.2
3 packets transmitted, 3 received, 0% packet loss   (ttl=62)

$ docker exec clab-dynamic-routing-bgp-srl1 sr_cli -c "show network-instance default route-table ipv4-unicast summary"
| Prefix      | Route Type | Route Owner | Pref | Next-hop (Type)              | Next-hop Interface |
|-------------|------------|-------------|------|------------------------------|--------------------|
| 10.1.4.0/24 | bgp        | bgp_mgr     | 170  | 10.1.2.0/24 (indirect/local) | ethernet-1/2.0     |
```

`10.1.4.0/24` is back to a **bgp** route via srl2 (`ethernet-1/2`), the direct path.

## Why static (Pref 5) beats BGP (Pref 170)

Pref 5 beats Pref 170. Lower preference always wins, regardless of which path is shorter.

This is **not** a BGP best-path decision. There are two separate selection steps:

| Step | Chooses between | Here |
|---|---|---|
| **BGP best path** | multiple BGP paths for the same prefix | picked `[65002]` via srl2 (correct) |
| **Route preference** (administrative distance) | different route sources for the same prefix | static (5) beat BGP (170), so the static route went into the forwarding table |

SR Linux preferences: **local 0 < static 5 < BGP 170**. A manually configured static route is trusted over anything learned dynamically, even when it's a worse path (here, one router longer). That's why stale static routes left over from before a migration to BGP are dangerous: they silently override the dynamic routing.

## Takeaways

- A static route for the same prefix overrides BGP, even when BGP is healthy and has a better path.
- Check the route **type** in the route table; if it says `static` where you expect `bgp`, look for leftover static config.
- Compare the forward path (traceroute) with the reply TTL; a mismatch means asymmetric routing.
- After migrating to dynamic routing, clean up the old static routes.

---

*Commands and outputs are from my lab run (2026-10-06). The preference vs best-path explanation, the BGP table and asymmetric-routing notes were added/corrected with help from Claude (AI-assisted).*
