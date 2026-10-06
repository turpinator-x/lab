# Exercise 2 Results: Enable the Direct Link and Observe Path Selection

Goal: bring up the pre-wired srl2–srl3 link, peer BGP across it, and watch BGP choose the shorter path automatically.

## Before: host2 → host3 goes through the hub

```
$ docker exec clab-dynamic-routing-bgp-host2 traceroute -n -w 2 10.1.5.2
 1  10.1.4.1  0.863 ms   <- srl2
 2  10.1.2.1  0.352 ms   <- srl1 (hub)
 3  10.1.3.2  0.732 ms   <- srl3
 4  10.1.5.2  0.220 ms   <- host3
```

## Configure the new link (10.1.6.0/24)

Interfaces (srl2 `10.1.6.1`, srl3 `10.1.6.2`):

```
$ gnmic -a clab-dynamic-routing-bgp-srl2:57400 -u admin -p NokiaSrl1! --skip-verify -e json_ietf set --request-file gnmic/configs/srl2-new-link.json
  "results": [
    { "operation": "UPDATE", "path": "interface[name=ethernet-1/3]" },
    { "operation": "UPDATE", "path": "network-instance[name=default]/interface[name=ethernet-1/3.0]" }
  ]
```

Same for srl3 (`srl3-new-link.json`).

BGP peering across the link:

```
$ gnmic -a clab-dynamic-routing-bgp-srl2:57400 ... set --request-file gnmic/configs/srl2-bgp-srl3.json
  "results": [
    { "operation": "UPDATE", "path": "network-instance[name=default]/protocols/bgp/neighbor[peer-address=10.1.6.2]" }
  ]

$ gnmic -a clab-dynamic-routing-bgp-srl3:57400 ... set --request-file gnmic/configs/srl3-bgp-srl2.json
  "results": [
    { "operation": "UPDATE", "path": "network-instance[name=default]/protocols/bgp/neighbor[peer-address=10.1.6.1]" }
  ]
```

Only a new neighbor was added; it reuses the existing `ebgp-peers` group and policies.

## BGP neighbors on srl2

```
$ docker exec clab-dynamic-routing-bgp-srl2 sr_cli -c "show network-instance default protocols bgp neighbor"
| Peer     | Group      | Peer-AS | State       | Uptime        | AFI/SAFI     | [Rx/Active/Tx] |
|----------|------------|---------|-------------|---------------|--------------|----------------|
| 10.1.2.1 | ebgp-peers | 65001   | established | 0d:0h:30m:4s  | ipv4-unicast | [4/3/3]        |
| 10.1.6.2 | ebgp-peers | 65003   | active      | -             |              |                |
```

Captured right after the config was pushed: the new session to srl3 was still in the **Active** state (trying to connect and not yet succeeding) because it had only just been configured on both ends. By the next step it had reached **Established**, since srl2 was already using routes learned from `10.1.6.2`.

## After: host2 → host3 goes direct

```
$ docker exec clab-dynamic-routing-bgp-host2 traceroute -n -w 2 10.1.5.2
 1  10.1.4.1  1.059 ms   <- srl2
 2  10.1.6.2  0.982 ms   <- srl3 (over the new link)
 3  10.1.5.2  0.261 ms   <- host3
```

One router hop fewer. No static routes were added; BGP learned the new path and switched to it within seconds. (In lesson 03, adding a cable did nothing without manually adding routes.)

## srl2's BGP routes: two paths per destination

```
$ docker exec clab-dynamic-routing-bgp-srl2 sr_cli -c "show network-instance default protocols bgp routes ipv4 summary"
Status codes: u=used, *=valid, >=best
| Status | Network     | Next Hop | Path Val            |
|--------|-------------|----------|---------------------|
| u*>    | 10.1.1.0/24 | 10.1.2.1 | [65001] i           |
| *      | 10.1.1.0/24 | 10.1.6.2 | [65003, 65001] i    |
| u*>    | 10.1.2.0/24 | 0.0.0.0  |  i                  |
| *      | 10.1.2.0/24 | 10.1.2.1 | [65001] i           |
| *      | 10.1.2.0/24 | 10.1.6.2 | [65003, 65001] i    |
| u*>    | 10.1.3.0/24 | 10.1.2.1 | [65001] i           |
| *      | 10.1.3.0/24 | 10.1.6.2 | [65003] i           |
| u*>    | 10.1.4.0/24 | 0.0.0.0  |  i                  |
| *      | 10.1.5.0/24 | 10.1.2.1 | [65001, 65003] i    |
| u*>    | 10.1.5.0/24 | 10.1.6.2 | [65003] i           |
| u*>    | 10.1.6.0/24 | 0.0.0.0  |  i                  |
| *      | 10.1.6.0/24 | 10.1.6.2 | [65003] i           |
12 received BGP routes: 6 used, 12 valid, 0 stale
```

(MED and LocPref columns empty and trimmed.) srl2 now hears about most networks from both neighbors. `u*>` marks the path that's best and used; `0.0.0.0` next hop means srl2's own connected network.

## Best path detail for host3's subnet

```
$ docker exec clab-dynamic-routing-bgp-srl2 sr_cli -c "show network-instance default protocols bgp routes ipv4 prefix 10.1.5.0/24 detail"
Network: 10.1.5.0/24
Received Paths: 2
  Path 1: <Valid,>
    Route source    : neighbor 10.1.2.1
    Route Preference: MED is -, No LocalPref
    BGP next-hop    : 10.1.2.1
    Path            :  i [65001, 65003]
    Tie Break Reason: as-path-length
  Path 2: <Best,Valid,Used,>
    Route source    : neighbor 10.1.6.2
    Route Preference: MED is -, No LocalPref
    BGP next-hop    : 10.1.6.2
    Path            :  i [65003]
    Tie Break Reason: none

Path 2 was advertised to:
[ 10.1.2.1 ]
Path            :  i [65002, 65003]
```

Path 2 was the best (preferred) route.

## Which best-path step decided it?

Both paths are for the same prefix (`10.1.5.0/24`), so longest prefix match doesn't apply; the BGP best-path algorithm does, rule by rule:

| Step | Path 1 (via srl1) | Path 2 (via srl3) | Result |
|---|---|---|---|
| 1. Local Preference (highest) | none | none | tie, next rule |
| 2. **AS Path length (shortest)** | `[65001, 65003]` = 2 | `[65003]` = 1 | **Path 2 wins** |

The router confirms it: Path 1's `Tie Break Reason: as-path-length`. The same rule makes srl2 keep using srl1 for host1's network: `[65001]` beats `[65003, 65001]`.

"Path 2 was advertised to 10.1.2.1" shows srl2 passing its best route on to srl1 with its own AS added to the front (`[65002, 65003]`). That's how the AS path grows at each hop, and how BGP detects loops (a router rejects a path that already contains its own AS).

## Takeaways

- Adding a link plus a BGP peering changes the forwarding path automatically, with no per-route configuration.
- When BGP has several paths to the same prefix, it walks the best-path rules in order; here **shortest AS path** decided.
- Longest prefix match picks between different prefixes; BGP best path picks between paths to the same prefix.

---

*Commands and outputs are from my lab run (2026-10-06). The best-path analysis was corrected (AS path length, not prefix length) and the write-up formatted with help from Claude (AI-assisted).*
