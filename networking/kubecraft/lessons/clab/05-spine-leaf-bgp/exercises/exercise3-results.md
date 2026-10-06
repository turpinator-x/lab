# Exercise 3 Results: Break/Fix -- Spine Failure (Fabric Resilience)

Goal: take a whole spine out of the fabric and show that connectivity survives with reduced capacity.

## Before: ECMP through both spines

From Exercise 2, leaf1 had **two next hops** (spine1 via `ethernet-1/49`, spine2 via `ethernet-1/50`) for every remote host subnet, with `IPv4 prefixes with active ECMP routes: 3`.

## Break it: disable all of spine1's leaf-facing ports

```
$ docker exec -it clab-spine-leaf-bgp-spine1 sr_cli
A:spine1# enter candidate
A:spine1# set / interface ethernet-1/1 admin-state disable
A:spine1# set / interface ethernet-1/2 admin-state disable
A:spine1# set / interface ethernet-1/3 admin-state disable
A:spine1# set / interface ethernet-1/4 admin-state disable
A:spine1# commit now
All changes have been committed. Leaving candidate mode.
```

(`diff` must be run *before* `commit now`; it only works in candidate mode, so running it afterwards returned an error with no effect.)

A continuous ping (`docker exec clab-spine-leaf-bgp-host1 ping -c 30 -i 1 10.20.4.2`) ran in a second terminal during the break: **no packets were dropped** (output not saved). The same result was seen in the video demo earlier.

## During: one path per destination

### leaf1 route table

```
$ docker exec clab-spine-leaf-bgp-leaf1 sr_cli -c "show network-instance default route-table ipv4-unicast summary"
| Prefix         | Route Type | Pref | Next-hop (Type)               | Next-hop Interface |
|----------------|------------|------|-------------------------------|--------------------|
| 10.10.2.0/31   | local      | 0    | 10.10.2.1 (direct)            | ethernet-1/50.0    |
| 10.10.2.1/32   | host       | 0    | None (extract)                | None               |
| 10.20.1.0/24   | local      | 0    | 10.20.1.1 (direct)            | ethernet-1/1.0     |
| 10.20.1.1/32   | host       | 0    | None (extract)                | None               |
| 10.20.1.255/32 | host       | 0    | None (broadcast)              |                    |
| 10.20.2.0/24   | bgp        | 170  | 10.10.2.0/31 (indirect/local) | ethernet-1/50.0    |
| 10.20.3.0/24   | bgp        | 170  | 10.10.2.0/31 (indirect/local) | ethernet-1/50.0    |
| 10.20.4.0/24   | bgp        | 170  | 10.10.2.0/31 (indirect/local) | ethernet-1/50.0    |
IPv4 routes total                    : 8
IPv4 prefixes with active ECMP routes: 0
```

- Each remote host subnet now has **one** next hop: `ethernet-1/50` (spine2).
- **Active ECMP routes: 0** (was 3).
- **10 routes → 8:** the local `10.10.1.0/31` link to spine1 and its `/32` host row disappeared with the link.

### leaf1 BGP neighbors

```
$ docker exec clab-spine-leaf-bgp-leaf1 sr_cli -c "show network-instance default protocols bgp neighbor"
| Peer      | Group  | Peer-AS | State       | Uptime        | AFI/SAFI     | [Rx/Active/Tx] |
|-----------|--------|---------|-------------|---------------|--------------|----------------|
| 10.10.1.0 | spines | 65000   | active      | -             |              |                |
| 10.10.2.0 | spines | 65000   | established | 0d:0h:42m:17s | ipv4-unicast | [3/3/1]        |
```

The spine1 session dropped to **active** (link down); spine2's session is unaffected and carries all 3 routes.

### Traceroute: everything through spine2

```
$ docker exec clab-spine-leaf-bgp-host1 traceroute -n -w 2 10.20.4.2
 1  10.20.1.1   <- leaf1
 2  10.10.2.0   <- spine2
 3  10.10.2.7   <- leaf4 (spine2-facing interface)
 4  10.20.4.2   <- host4
```

All three probes at every hop now use spine2 (compare Exercise 2, where probes were split across both spines).

## Fix: re-enable spine1

```
A:spine1# enter candidate
A:spine1# set / interface ethernet-1/1 admin-state enable
A:spine1# set / interface ethernet-1/2 admin-state enable
A:spine1# set / interface ethernet-1/3 admin-state enable
A:spine1# set / interface ethernet-1/4 admin-state enable
A:spine1# commit now
```

## After: ECMP restored

```
$ docker exec clab-spine-leaf-bgp-leaf1 sr_cli -c "show network-instance default route-table ipv4-unicast summary"
| Prefix       | Route Type | Pref | Next-hop (Type)                                              | Next-hop Interface               |
|--------------|------------|------|--------------------------------------------------------------|----------------------------------|
| 10.20.2.0/24 | bgp        | 170  | 10.10.1.0/31 (indirect/local), 10.10.2.0/31 (indirect/local) | ethernet-1/49.0, ethernet-1/50.0 |
| 10.20.3.0/24 | bgp        | 170  | 10.10.1.0/31 (indirect/local), 10.10.2.0/31 (indirect/local) | ethernet-1/49.0, ethernet-1/50.0 |
| 10.20.4.0/24 | bgp        | 170  | 10.10.1.0/31 (indirect/local), 10.10.2.0/31 (indirect/local) | ethernet-1/49.0, ethernet-1/50.0 |
IPv4 routes total                    : 10
IPv4 prefixes with active ECMP routes: 3
```

(Local/host rows trimmed.) Back to two next hops per destination and 3 ECMP routes.

| | Before | Spine1 down | After |
|---|---|---|---|
| Next hops per remote subnet | 2 | 1 | 2 |
| Active ECMP routes | 3 | 0 | 3 |
| Routes total | 10 | 8 | 10 |

## Why losing a spine degrades capacity but not connectivity

The connectivity is fine because of the self-healing nature of BGP and its ability to use alternate routes. Capacity for traffic is reduced, which can cause slowdowns (e.g. large file transfers) at peak traffic, but you still have an active connection. The routes are still there.

Why it's especially fast in a spine-leaf fabric: with ECMP, leaf1 already had the spine2 path **installed and in use** alongside spine1. When spine1 disappeared, nothing had to be recalculated; leaf1 simply removed one of the two next hops it already had. Every leaf connects to every spine, so as long as one spine is up, every leaf can still reach every other leaf through it. With 2 spines, losing one halves the leaf-to-leaf bandwidth; with more spines, each failure costs proportionally less (e.g. 1 of 4 spines = 25%).

---

*Commands and outputs are from my lab run (2026-10-06); the ping during the break showed 0% loss (output not saved). The capacity-vs-connectivity explanation is mine, with the ECMP/pre-installed-path detail added and the write-up formatted with help from Claude (AI-assisted).*
