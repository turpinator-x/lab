# Exercise 1 Results: Deploy and Configure the Fabric

Goal: deploy a 2-spine, 4-leaf Clos fabric, configure eBGP on all six routers with gNMIc, and verify cross-leaf connectivity.

Topology diagram: [diagrams/01-spine-leaf-topology.svg](diagrams/01-spine-leaf-topology.svg)

| Device | ASN | Router ID | BGP peers |
|---|---|---|---|
| spine1 | 65000 | 10.0.1.1 | leaf1–4 (`10.10.1.1/.3/.5/.7`) |
| spine2 | 65000 | 10.0.1.2 | leaf1–4 (`10.10.2.1/.3/.5/.7`) |
| leaf1–4 | 65001–65004 | 10.0.2.1–4 | spine1 (`10.10.1.x`) + spine2 (`10.10.2.x`) |

All spine–leaf links are /31; each host is on `10.20.N.0/24` behind leafN.

## Deploy

```
$ sudo clab deploy -t topology/lab.clab.yml
...
INFO Created link: spine1:e1-1 ▪┄┄▪ leaf1:e1-49
INFO Created link: spine2:e1-1 ▪┄┄▪ leaf1:e1-50
... (12 links total: 8 spine–leaf + 4 leaf–host)
```

All 10 containers running (2 spines, 4 leaves, 4 hosts). Interface IPs come from the startup configs in `topology/configs/`; BGP is added next.

## Apply BGP with gNMIc

Run from `gnmic/` so `.gnmic.yml` supplies the username, password, encoding and skip-verify:

```
$ cd gnmic
$ gnmic -a clab-spine-leaf-bgp-spine1:57400 set --request-file configs/spine1-bgp.json
  "results": [
    { "operation": "UPDATE", "path": "routing-policy/prefix-set[name=host-subnets]" },
    { "operation": "UPDATE", "path": "routing-policy/policy[name=import-all]" },
    { "operation": "UPDATE", "path": "routing-policy/policy[name=export-connected]" },
    { "operation": "UPDATE", "path": "routing-policy/policy[name=export-bgp]" },
    { "operation": "UPDATE", "path": "network-instance[name=default]/protocols/bgp" }
  ]
```

Same for spine2 and leaf1–leaf4, each returning the same five `UPDATE`s.

## What the config files apply (leaf1-bgp.json)

### Why a default-deny NOS needs all three policies

It needs to know what data to send and receive to and from the external ASes; otherwise it doesn't know where to route.

SR Linux rejects all BGP routes by default, so each policy opens one door:

| Policy | What it allows | If it were missing |
|---|---|---|
| `import-all` | accept routes received from neighbors | the router ignores everything it hears; no routes to other hosts |
| `export-connected` | advertise the router's own connected host subnet (filtered by `host-subnets`) | its own host is never advertised; nobody can reach it |
| `export-bgp` | re-advertise routes learned via BGP | spines couldn't pass one leaf's subnet on to the other leaves |

### Prefix-set filter: `host-subnets`

```json
"prefix": [{"ip-prefix": "10.20.0.0/16", "mask-length-range": "24..24"}]
```

Matches any prefix inside `10.20.0.0/16` whose length is **exactly /24**: the host subnets `10.20.1.0/24` to `10.20.4.0/24`.

Excludes: the /31 fabric links (`10.10.x.x` is outside the range, and /31 is the wrong length), router IDs, and anything in `10.20.x.x` that isn't exactly /24 (e.g. a `/25`). Used on `export-connected`, it keeps fabric link addresses out of BGP so only host subnets are advertised.

### Multipath: `maximum-paths: 2`

It would take only the one route that's the best preferred route.

SR Linux defaults to `maximum-paths 1`: BGP installs a single best path, so one spine carries all the traffic and the other is idle. `maximum-paths 2` installs both equal paths, giving ECMP across the two spines.

### Shared spine ASN (65000)

Both of leaf1's neighbors have `peer-as 65000` because the **spines share one ASN**, while each **leaf has its own** (65001–65004). This is RFC 7938's recommendation, for two reasons:

- **ECMP:** paths to another leaf through either spine have identical AS paths (e.g. `[65000, 65004]`), so BGP treats them as equal and uses both.
- **Loop prevention:** if a leaf re-advertises a route back up toward the other spine, that spine sees 65000 already in the AS path and rejects it.

## Verify: BGP sessions

### Spine (4 sessions, one per leaf)

```
$ docker exec clab-spine-leaf-bgp-spine1 sr_cli -c "show network-instance default protocols bgp neighbor"
| Peer      | Group  | Peer-AS | State       | Uptime       | AFI/SAFI     | [Rx/Active/Tx] |
|-----------|--------|---------|-------------|--------------|--------------|----------------|
| 10.10.1.1 | leaves | 65001   | established | 0d:0h:1m:28s | ipv4-unicast | [1/1/3]        |
| 10.10.1.3 | leaves | 65002   | established | 0d:0h:1m:28s | ipv4-unicast | [1/1/3]        |
| 10.10.1.5 | leaves | 65003   | established | 0d:0h:1m:28s | ipv4-unicast | [1/1/3]        |
| 10.10.1.7 | leaves | 65004   | established | 0d:0h:1m:28s | ipv4-unicast | [1/1/3]        |
4 configured neighbors, 4 configured sessions are established
```

Each leaf sends spine1 **1** route (its host subnet), and spine1 sends each leaf **3** (the other leaves' subnets).

### Leaf (2 sessions, one per spine)

```
$ docker exec clab-spine-leaf-bgp-leaf1 sr_cli -c "show network-instance default protocols bgp neighbor"
| Peer      | Group  | Peer-AS | State       | Uptime        | AFI/SAFI     | [Rx/Active/Tx] |
|-----------|--------|---------|-------------|---------------|--------------|----------------|
| 10.10.1.0 | spines | 65000   | established | 0d:0h:7m:16s  | ipv4-unicast | [3/3/1]        |
| 10.10.2.0 | spines | 65000   | established | 0d:0h:21m:1s  | ipv4-unicast | [3/3/4]        |
2 configured neighbors, 2 configured sessions are established
```

- **Rx 3 / Active 3 from both spines:** leaf1 uses all 3 remote host subnets from each spine (ECMP).
- The spine1 session is younger (7m vs 21m) because it went down and came back during the spine-failure demo in the video.
- **Tx 1 vs Tx 4:** leaf1 sends spine1 only its own subnet, but sends spine2 its subnet plus 3 learned routes (most likely because BGP doesn't advertise a route back to the neighbor its best path came from). spine2 rejects those 3 anyway, because 65000 is already in their AS path: the shared-ASN loop prevention.

## Verify: cross-leaf connectivity

| From | To | TTL | Result |
|---|---|---|---|
| host1 | host2 `10.20.2.2` | 61 | ✅ 0% loss |
| host1 | host3 `10.20.3.2` | 61 | ✅ 0% loss |
| host1 | host4 `10.20.4.2` | 61 | ✅ 0% loss |
| host2 | host4 `10.20.4.2` | 61 | ✅ 0% loss |

```
$ docker exec clab-spine-leaf-bgp-host1 ping -c 3 10.20.2.2
64 bytes from 10.20.2.2: icmp_seq=1 ttl=61 time=47.8 ms
64 bytes from 10.20.2.2: icmp_seq=2 ttl=61 time=0.405 ms
64 bytes from 10.20.2.2: icmp_seq=3 ttl=61 time=0.503 ms
3 packets transmitted, 3 received, 0% packet loss

$ docker exec clab-spine-leaf-bgp-host1 ping -c 3 10.20.3.2
64 bytes from 10.20.3.2: icmp_seq=1 ttl=61 time=45.9 ms
...
3 packets transmitted, 3 received, 0% packet loss

$ docker exec clab-spine-leaf-bgp-host1 ping -c 3 10.20.4.2
64 bytes from 10.20.4.2: icmp_seq=1 ttl=61 time=16.7 ms
...
3 packets transmitted, 3 received, 0% packet loss

$ docker exec clab-spine-leaf-bgp-host2 ping -c 3 10.20.4.2
64 bytes from 10.20.4.2: icmp_seq=1 ttl=61 time=0.729 ms
...
3 packets transmitted, 3 received, 0% packet loss
```

Every host-to-host path has the same TTL (61 = 3 routers: leaf → spine → leaf). In a Clos fabric, any two hosts on different leaves are always the same distance apart.

---

*Commands and outputs are from my lab run (2026-10-06). Q3 answer is mine; Q1 expanded, Q2 and Q4 explained/corrected, and the write-up formatted with help from Claude (AI-assisted).*
