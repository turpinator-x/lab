# Exercise 2 Results: Read the Fabric Routing Table -- Observe ECMP

Goal: confirm ECMP across both spines, the configuration that enables it, and that only host subnets are carried in BGP.

## Multipath is configured

```
$ docker exec clab-spine-leaf-bgp-leaf1 sr_cli -c "info network-instance default protocols bgp afi-safi ipv4-unicast multipath"
    network-instance default {
        protocols {
            bgp {
                afi-safi ipv4-unicast {
                    multipath {
                        maximum-paths 2
                    }
                }
            }
        }
    }
```

SR Linux defaults to `maximum-paths 1` (one best path only). With 2, BGP installs both spine paths.

## leaf1 route table: ECMP entries

```
$ docker exec clab-spine-leaf-bgp-leaf1 sr_cli -c "show network-instance default route-table ipv4-unicast summary"
| Prefix         | Route Type | Pref | Next-hop (Type)                                              | Next-hop Interface                |
|----------------|------------|------|--------------------------------------------------------------|-----------------------------------|
| 10.10.1.0/31   | local      | 0    | 10.10.1.1 (direct)                                           | ethernet-1/49.0                   |
| 10.10.1.1/32   | host       | 0    | None (extract)                                               | None                              |
| 10.10.2.0/31   | local      | 0    | 10.10.2.1 (direct)                                           | ethernet-1/50.0                   |
| 10.10.2.1/32   | host       | 0    | None (extract)                                               | None                              |
| 10.20.1.0/24   | local      | 0    | 10.20.1.1 (direct)                                           | ethernet-1/1.0                    |
| 10.20.1.1/32   | host       | 0    | None (extract)                                               | None                              |
| 10.20.1.255/32 | host       | 0    | None (broadcast)                                             |                                   |
| 10.20.2.0/24   | bgp        | 170  | 10.10.1.0/31 (indirect/local), 10.10.2.0/31 (indirect/local) | ethernet-1/49.0, ethernet-1/50.0  |
| 10.20.3.0/24   | bgp        | 170  | 10.10.1.0/31 (indirect/local), 10.10.2.0/31 (indirect/local) | ethernet-1/49.0, ethernet-1/50.0  |
| 10.20.4.0/24   | bgp        | 170  | 10.10.1.0/31 (indirect/local), 10.10.2.0/31 (indirect/local) | ethernet-1/49.0, ethernet-1/50.0  |
IPv4 routes total                    : 10
IPv4 prefixes with active ECMP routes: 3
```

(Columns trimmed.) Each remote host subnet has **two next hops**: `ethernet-1/49` (spine1) and `ethernet-1/50` (spine2). The summary confirms **3 prefixes with active ECMP routes**. The /31 links have no broadcast row: a /31 has just two usable addresses (RFC 3021).

## Only host subnets are carried in BGP

```
$ docker exec clab-spine-leaf-bgp-leaf1 sr_cli -c "show network-instance default protocols bgp routes ipv4 summary"
Status codes: u=used, *=valid, >=best
| Status | Network      | Next Hop  | Path Val         |
|--------|--------------|-----------|------------------|
| u*>    | 10.10.1.0/31 | 0.0.0.0   |  i               |
| u*>    | 10.10.2.0/31 | 0.0.0.0   |  i               |
| u*>    | 10.20.1.0/24 | 0.0.0.0   |  i               |
| u*>    | 10.20.2.0/24 | 10.10.1.0 | [65000, 65002] i |
| u*>    | 10.20.2.0/24 | 10.10.2.0 | [65000, 65002] i |
| u*>    | 10.20.3.0/24 | 10.10.1.0 | [65000, 65003] i |
| u*>    | 10.20.3.0/24 | 10.10.2.0 | [65000, 65003] i |
| u*>    | 10.20.4.0/24 | 10.10.1.0 | [65000, 65004] i |
| u*>    | 10.20.4.0/24 | 10.10.2.0 | [65000, 65004] i |
9 received BGP routes: 9 used, 9 valid, 0 stale
```

- The two `/31` rows (and `10.20.1.0/24`) have next hop **`0.0.0.0`**: they're leaf1's **own** local routes in its BGP table, not received from anyone.
- **No other leaf's /31 links appear** (e.g. `10.10.1.2/31`), so none are advertised into the fabric. The `host-subnets` prefix-set on `export-connected` only lets exactly-/24 host subnets out; the spines' `Rx 1` per leaf confirms each leaf sends only its host subnet.
- Each remote host subnet has **two used, best paths (`u*>`)**, one per spine, with **identical AS paths** (`[65000, 6500x]`). That equality is what makes them ECMP-eligible.

## Traceroute host1 → host4 (three runs)

```
$ docker exec clab-spine-leaf-bgp-host1 traceroute -n -w 2 10.20.4.2
 1  10.20.1.1  1.154 ms  1.132 ms  1.118 ms
 2  10.10.2.0  1.307 ms  1.302 ms  1.297 ms
 3  10.10.1.7  1.435 ms  1.441 ms 10.10.2.7  1.377 ms
 4  10.20.4.2  0.409 ms  0.463 ms  0.469 ms

$ docker exec clab-spine-leaf-bgp-host1 traceroute -n -w 2 10.20.4.2
 1  10.20.1.1  0.506 ms  0.477 ms  0.471 ms
 2  10.10.2.0  0.687 ms  0.691 ms  0.698 ms
 3  10.10.1.7  0.695 ms  0.697 ms  0.697 ms
 4  * * *
 ...
 9  * 10.20.4.2  0.633 ms *

$ docker exec clab-spine-leaf-bgp-host1 traceroute -n -w 2 10.20.4.2
 1  10.20.1.1  0.850 ms  0.835 ms  0.829 ms
 2  10.10.1.0  0.625 ms 10.10.2.0  1.065 ms  1.067 ms
 3  10.10.1.7  1.113 ms 10.10.2.7  1.157 ms 10.10.1.7  1.131 ms
 4  * 10.20.4.2  0.683 ms  0.687 ms
```

How to read it:

| Hop | Device | Address via spine1 | Address via spine2 |
|---|---|---|---|
| 1 | leaf1 | 10.20.1.1 | 10.20.1.1 |
| 2 | spine | 10.10.1.0 (spine1) | 10.10.2.0 (spine2) |
| 3 | leaf4 | 10.10.1.7 | 10.10.2.7 |
| 4 | host4 | 10.20.4.2 | 10.20.4.2 |

Both spines appear, sometimes within a single run. Traceroute sends 3 probes per hop, each with a different UDP port; ECMP hashes each packet's addresses and ports to pick a spine, so different probes take different spines. That's ECMP spreading flows across the fabric.

The `* * *` gap in run 2 (hops 4–8) is most likely host4 rate-limiting its ICMP replies; the path was still 4 hops.

## Questions

1. **How many hops between any two hosts on different leaves?** Always 4 in traceroute (leaf → spine → leaf → host), i.e. 3 routers, matching `ttl=61` on every cross-leaf ping. Every leaf is exactly one spine away from every other leaf.
2. **How many equal-cost paths between any two leaves?** 2, one through each spine.
3. **What happens to bandwidth with a third spine?** Aggregate leaf-to-leaf bandwidth increases by 50% and there are 3 ECMP paths. Each leaf needs a third uplink, and `maximum-paths` must be raised to 3 to use all of them. This is how spine-leaf scales bandwidth: add spines.

---

*Commands and outputs are from my lab run (2026-10-06). The BGP-table and traceroute observations are mine; the explanations and the answers to the three questions were written with help from Claude (AI-assisted).*
