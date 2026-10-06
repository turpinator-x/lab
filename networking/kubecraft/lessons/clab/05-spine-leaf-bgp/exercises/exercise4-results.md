# Exercise 4 Results (Challenge): Break/Fix -- Route Leak / Hijack

Goal: have leaf1 advertise a more-specific `/25` covering part of leaf4's host subnet, pulling traffic for host4 into a black hole on leaf1.

## Break it (as written in the course)

```
$ docker exec -it clab-spine-leaf-bgp-leaf1 sr_cli
A:leaf1# enter candidate
A:leaf1# set / routing-policy prefix-set hijack prefix 10.20.4.0/25 mask-length-range exact
A:leaf1# set / routing-policy policy export-hijack statement 10 match prefix-set hijack
A:leaf1# set / routing-policy policy export-hijack statement 10 action policy-result accept
A:leaf1# set / routing-policy policy export-hijack statement 20 match protocol local
A:leaf1# set / routing-policy policy export-hijack statement 20 action policy-result accept
A:leaf1# set / routing-policy policy export-hijack default-action policy-result reject
A:leaf1# set / network-instance default protocols bgp group spines export-policy [export-hijack]
A:leaf1# set / network-instance default static-routes route 10.20.4.0/25 admin-state enable
A:leaf1# set / network-instance default next-hop-groups group nhg-blackhole admin-state enable
A:leaf1# set / network-instance default next-hop-groups group nhg-blackhole nexthop 1 ip-address 192.0.2.1
A:leaf1# set / network-instance default static-routes route 10.20.4.0/25 next-hop-group nhg-blackhole
A:leaf1# diff
      network-instance default {
          protocols { bgp { group spines {
              export-policy [
-                 export-bgp
-                 export-connected
+                 export-hijack
              ]
          } } }
+         static-routes { route 10.20.4.0/25 { admin-state enable  next-hop-group nhg-blackhole } }
+         next-hop-groups { group nhg-blackhole { admin-state enable  nexthop 1 { ip-address 192.0.2.1 } } }
      }
      routing-policy {
+         prefix-set hijack { prefix 10.20.4.0/25 mask-length-range exact }
+         policy export-hijack {
+             default-action { policy-result reject }
+             statement 10 { match { prefix-set hijack }  action { policy-result accept } }
+             statement 20 { match { protocol local }     action { policy-result accept } }
+         }
      }
A:leaf1# commit now
All changes have been committed. Leaving candidate mode.
```

(`diff` output condensed.) The diff shows the key change: leaf1's export policy is **replaced**, `[export-connected export-bgp]` → `[export-hijack]`.

## Symptom: no hijack, pings still work

```
$ docker exec clab-spine-leaf-bgp-host2 ping -c 3 -W 2 10.20.4.2
3 packets transmitted, 3 received, 0% packet loss   (ttl=61)

$ docker exec clab-spine-leaf-bgp-host3 ping -c 3 -W 2 10.20.4.2
3 packets transmitted, 3 received, 0% packet loss   (ttl=61)

$ docker exec clab-spine-leaf-bgp-host2 traceroute -n -w 2 10.20.4.2
 1  10.20.2.1   <- leaf2
 2  10.10.2.2  10.10.1.2  10.10.2.2   <- spine2 / spine1 (ECMP)
 3  10.10.2.7   <- leaf4
 4  10.20.4.2   <- host4
```

Traffic to host4 takes the normal path through the spines to leaf4.

## Diagnose

### leaf1: the /25 never became active

```
$ docker exec clab-spine-leaf-bgp-leaf1 sr_cli -c "show network-instance default route-table ipv4-unicast summary"
| Prefix       | Route Type | Pref | Next-hop Interface               |
|--------------|------------|------|----------------------------------|
| 10.10.1.0/31 | local      | 0    | ethernet-1/49.0                  |
| 10.10.2.0/31 | local      | 0    | ethernet-1/50.0                  |
| 10.20.1.0/24 | local      | 0    | ethernet-1/1.0                   |
| 10.20.2.0/24 | bgp        | 170  | ethernet-1/49.0, ethernet-1/50.0 |
| 10.20.3.0/24 | bgp        | 170  | ethernet-1/49.0, ethernet-1/50.0 |
| 10.20.4.0/24 | bgp        | 170  | ethernet-1/49.0, ethernet-1/50.0 |
IPv4 routes total : 10
```

(Host /32 rows and columns trimmed.) There's **no `10.20.4.0/25`** on leaf1. The static route's next hop, `192.0.2.1`, isn't on any network leaf1 is connected to, so SR Linux can't resolve it and doesn't install the route. A route that isn't in the route table can't be exported, so the /25 was never advertised and the hijack never happened.

### leaf2: no /25, but leaf1's /31 links leaked

```
$ docker exec clab-spine-leaf-bgp-leaf2 sr_cli -c "show network-instance default route-table ipv4-unicast summary"
| Prefix       | Route Type | Pref | Next-hop Interface               |
|--------------|------------|------|----------------------------------|
| 10.10.1.0/31 | bgp        | 170  | ethernet-1/50.0                  |   <- leaf1's link to spine1 (leaked)
| 10.10.1.2/31 | local      | 0    | ethernet-1/49.0                  |
| 10.10.2.0/31 | bgp        | 170  | ethernet-1/49.0                  |   <- leaf1's link to spine2 (leaked)
| 10.10.2.2/31 | local      | 0    | ethernet-1/50.0                  |
| 10.20.1.0/24 | bgp        | 170  | ethernet-1/49.0, ethernet-1/50.0 |
| 10.20.2.0/24 | local      | 0    | ethernet-1/1.0                   |
| 10.20.3.0/24 | bgp        | 170  | ethernet-1/49.0, ethernet-1/50.0 |
| 10.20.4.0/24 | bgp        | 170  | ethernet-1/49.0, ethernet-1/50.0 |
IPv4 routes total : 12
```

(Host /32 rows and columns trimmed.) No `/25` (so no hijack), but leaf2 now has **two BGP routes it shouldn't**: `10.10.1.0/31` and `10.10.2.0/31`, leaf1's fabric links. The new `export-hijack` policy's statement 20 (`match protocol local`) accepts **all** of leaf1's connected routes, with no `host-subnets` prefix-set filter, so replacing the export policy leaked the /31 links into the fabric. This is a real route leak caused by swapping a filtered policy for an unfiltered one.

## Fix

```
A:leaf1# enter candidate
A:leaf1# delete / routing-policy prefix-set hijack
A:leaf1# delete / routing-policy policy export-hijack
A:leaf1# delete / network-instance default static-routes route 10.20.4.0/25
A:leaf1# delete / network-instance default next-hop-groups group nhg-blackhole
A:leaf1# set / network-instance default protocols bgp group spines export-policy [export-connected export-bgp]
A:leaf1# commit now
All changes have been committed. Leaving candidate mode.
```

## Verify

```
$ docker exec clab-spine-leaf-bgp-host2 ping -c 3 10.20.4.2
3 packets transmitted, 3 received, 0% packet loss   (ttl=61)

$ docker exec clab-spine-leaf-bgp-host3 ping -c 3 10.20.4.2
3 packets transmitted, 3 received, 0% packet loss   (ttl=61)
```

## Why a /25 would win over the legitimate /24

My first answer was "the static route takes precedence over the BGP route", but that's route preference (lesson 04, exercise 6), which compares **different sources for the same prefix**. A hijack works through **longest prefix match**, which compares **different prefixes**:

- leaf4 advertises `10.20.4.0/24`; the hijacker advertises `10.20.4.0/25`.
- Both would reach leaf2 as **BGP** routes, so preference is equal and irrelevant.
- For destination `10.20.4.2`, both prefixes match, and the router always uses the **most specific** one: the /25 (more network bits) wins, no matter which is legitimate.

So a single more-specific announcement can pull traffic away from the real owner. That's how real internet BGP hijacks work, and why operators filter what they accept (e.g. only expected prefixes and lengths, like the `host-subnets` prefix-set does here).

## Takeaways

- A static route only becomes active if its next hop is reachable; an unresolvable next hop leaves it out of the route table, so it can't be exported. (In this run, that's why the hijack didn't take effect.)
- Changing an export policy can leak routes: the replacement policy here had no prefix filter, so leaf1's /31 links appeared in other leaves' tables.
- Longest prefix match beats everything else when prefixes differ; filtering prefix lengths at the edges is the defence.

---

*Commands and outputs are from my lab run (2026-10-06). The hijack did not take effect in this run (unresolvable next hop); the /31 leak analysis, the longest-prefix-match correction and the formatting were done with help from Claude (AI-assisted).*
