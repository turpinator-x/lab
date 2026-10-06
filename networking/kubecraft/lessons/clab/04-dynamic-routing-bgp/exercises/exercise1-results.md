# Exercise 1 Results: Deploy and Configure eBGP

Goal: deploy the hub-and-spoke topology with no routing between subnets, then configure eBGP on all three routers with gNMIc to restore full connectivity.

Topology diagram: [diagrams/01-bgp-hub-spoke-path.svg](diagrams/01-bgp-hub-spoke-path.svg)

| Router | Role | ASN | Router ID | eBGP neighbors |
|---|---|---|---|---|
| srl1 | hub | 65001 | 10.0.0.1 | 10.1.2.2 (AS 65002), 10.1.3.2 (AS 65003) |
| srl2 | spoke | 65002 | 10.0.0.2 | 10.1.2.1 (AS 65001) |
| srl3 | spoke | 65003 | 10.0.0.3 | 10.1.3.1 (AS 65001) |

## Before BGP: pings fail

```
$ docker exec clab-dynamic-routing-bgp-host1 ping -c 3 10.1.4.2
PING 10.1.4.2 (10.1.4.2) 56(84) bytes of data.
From 10.1.1.1 icmp_seq=1 Destination Net Unreachable
From 10.1.1.1 icmp_seq=2 Destination Net Unreachable
From 10.1.1.1 icmp_seq=3 Destination Net Unreachable

--- 10.1.4.2 ping statistics ---
3 packets transmitted, 0 received, +3 errors, 100% packet loss
```

The routers start with interfaces configured but **no static routes and no BGP**, so srl1 only knows its directly connected subnets. It has no route to host2's network (`10.1.4.0/24`) and replies with ICMP "Destination Net Unreachable". (The "before" route table wasn't captured; the failed ping shows the same thing.)

### The unconfigured srl2–srl3 link

```
$ docker exec clab-dynamic-routing-bgp-srl2 sr_cli -c "show interface ethernet-1/3"
ethernet-1/3 is up, speed 25G, type None
```

The cable is there and the port is up, but there's no subinterface or IP address on it yet, so it carries no traffic. It gets configured in Exercise 2.

## Configure BGP with gNMIc

The BGP routing config was missing, which is why the ping failed. I applied it to each router with gNMIc, connecting to the router's gNMI port (Nokia uses **57400**) and pushing the JSON config file:

```
$ gnmic -a clab-dynamic-routing-bgp-srl1:57400 -u admin -p NokiaSrl1! --skip-verify -e json_ietf set --request-file gnmic/configs/srl1-bgp.json
{
  "source": "clab-dynamic-routing-bgp-srl1:57400",
  "results": [
    { "operation": "UPDATE", "path": "routing-policy/policy[name=import-all]" },
    { "operation": "UPDATE", "path": "routing-policy/policy[name=export-connected]" },
    { "operation": "UPDATE", "path": "routing-policy/policy[name=export-bgp]" },
    { "operation": "UPDATE", "path": "network-instance[name=default]/protocols/bgp" }
  ]
}
```

Same command for srl2 (`srl2-bgp.json`) and srl3 (`srl3-bgp.json`), each returning the same four `UPDATE` results.

| gnmic part | What it does |
|---|---|
| `-a host:57400` | router address and gNMI port |
| `-u admin -p NokiaSrl1!` | login credentials |
| `--skip-verify` | TLS, but don't verify the lab's self-signed certificate |
| `-e json_ietf` | JSON (IETF style) encoding |
| `set --request-file FILE` | apply the config changes in the JSON file (one all-or-nothing transaction) |

What each config file sets up:

| Update | Purpose |
|---|---|
| `import-all` policy | accept every route received from neighbors (SR Linux rejects all BGP routes by default) |
| `export-connected` policy | advertise the router's own directly connected networks; pass anything else to the next policy |
| `export-bgp` policy | re-advertise routes learned via BGP (lets the hub pass routes between spokes); reject everything else |
| `protocols/bgp` | enable BGP with the router's ASN and router ID, a peer group using the policies above, and its neighbors (IP + peer ASN) |

## After BGP

### Sessions established

```
A:srl1# show network-instance default protocols bgp neighbor
| Net-Inst | Peer     | Group      | Flags | Peer-AS | State       | Uptime       | AFI/SAFI     | [Rx/Active/Tx] |
|----------|----------|------------|-------|---------|-------------|--------------|--------------|----------------|
| default  | 10.1.2.2 | ebgp-peers | S     | 65002   | established | 0d:0h:8m:45s | ipv4-unicast | [2/1/4]        |
| default  | 10.1.3.2 | ebgp-peers | S     | 65003   | established | 0d:0h:7m:32s | ipv4-unicast | [2/1/4]        |
2 configured neighbors, 2 configured sessions are established
```

`[Rx/Active/Tx] = [2/1/4]` for srl2: srl1 **received** 2 routes (srl2's connected `10.1.2.0/24` and `10.1.4.0/24`), uses 1 of them as **active** (`10.1.4.0/24`; for `10.1.2.0/24` its own local route wins), and **sent** 4.

### srl1 route table: remote subnets learned via BGP

```
A:srl1# show network-instance default route-table ipv4-unicast summary
| Prefix        | Route Type | Route Owner  | Pref | Next-hop (Type)              | Next-hop Interface |
|---------------|------------|--------------|------|------------------------------|--------------------|
| 10.1.1.0/24   | local      | net_inst_mgr | 0    | 10.1.1.1 (direct)            | ethernet-1/1.0     |
| 10.1.2.0/24   | local      | net_inst_mgr | 0    | 10.1.2.1 (direct)            | ethernet-1/2.0     |
| 10.1.3.0/24   | local      | net_inst_mgr | 0    | 10.1.3.1 (direct)            | ethernet-1/3.0     |
| 10.1.4.0/24   | bgp        | bgp_mgr      | 170  | 10.1.2.0/24 (indirect/local) | ethernet-1/2.0     |
| 10.1.5.0/24   | bgp        | bgp_mgr      | 170  | 10.1.3.0/24 (indirect/local) | ethernet-1/3.0     |
IPv4 routes total : 11   (including 6 host /32 rows)
```

(Columns trimmed.) The spoke subnets now appear as `bgp` routes. Route preference: local 0 < static 5 < BGP 170; lower wins.

### Routes srl1 advertises to srl2

```
A:srl1# show network-instance default protocols bgp neighbor 10.1.2.2 advertised-routes ipv4
Peer : 10.1.2.2, remote AS: 65002, local AS: 65001
| Network     | Next Hop | AsPath         | Origin |
|-------------|----------|----------------|--------|
| 10.1.1.0/24 | 10.1.2.1 | [65001]        | i      |
| 10.1.2.0/24 | 10.1.2.1 | [65001]        | i      |
| 10.1.3.0/24 | 10.1.2.1 | [65001]        | i      |
| 10.1.5.0/24 | 10.1.2.1 | [65001, 65003] | i      |
4 advertised BGP routes
```

- `[65001]`: srl1's own connected networks (`export-connected`).
- `[65001, 65003]`: host3's subnet, learned from srl3 and passed on (`export-bgp`). The AS path lists every AS the route crossed.
- `10.1.4.0/24` isn't sent back to srl2, the AS it came from; srl2 would reject a route containing its own AS anyway. That's BGP loop prevention.

### Pings succeed

| From | To | TTL | Result |
|---|---|---|---|
| host1 | host2 `10.1.4.2` | 62 (2 routers) | ✅ 0% loss |
| host1 | host3 `10.1.5.2` | 62 (2 routers) | ✅ 0% loss |
| host2 | host3 `10.1.5.2` | 61 (3 routers) | ✅ 0% loss |

```
$ docker exec clab-dynamic-routing-bgp-host1 ping -c 3 10.1.4.2
64 bytes from 10.1.4.2: icmp_seq=1 ttl=62 time=106 ms
64 bytes from 10.1.4.2: icmp_seq=2 ttl=62 time=0.343 ms
64 bytes from 10.1.4.2: icmp_seq=3 ttl=62 time=0.301 ms
3 packets transmitted, 3 received, 0% packet loss

$ docker exec clab-dynamic-routing-bgp-host1 ping -c 3 10.1.5.2
64 bytes from 10.1.5.2: icmp_seq=1 ttl=62 time=99.9 ms
64 bytes from 10.1.5.2: icmp_seq=2 ttl=62 time=0.287 ms
64 bytes from 10.1.5.2: icmp_seq=3 ttl=62 time=0.298 ms
3 packets transmitted, 3 received, 0% packet loss

$ docker exec clab-dynamic-routing-bgp-host2 ping -c 3 10.1.5.2
64 bytes from 10.1.5.2: icmp_seq=1 ttl=61 time=0.381 ms
64 bytes from 10.1.5.2: icmp_seq=2 ttl=61 time=0.334 ms
64 bytes from 10.1.5.2: icmp_seq=3 ttl=61 time=0.373 ms
3 packets transmitted, 3 received, 0% packet loss
```

### Path host2 → host3 (through the hub)

```
$ docker exec clab-dynamic-routing-bgp-host2 traceroute 10.1.5.2
 1  10.1.4.1 (10.1.4.1)  0.384 ms   <- srl2
 2  10.1.2.1 (10.1.2.1)  0.765 ms   <- srl1 (hub)
 3  10.1.3.2 (10.1.3.2)  1.124 ms   <- srl3
 4  10.1.5.2 (10.1.5.2)  0.372 ms   <- host3
```

## Why it works now

Before, the routers had no way to learn about each other's networks, so any ping to another subnet died at the first router. After applying the BGP config, each router peers with its neighbor(s), advertises its own connected networks, and (on the hub) re-advertises what it learned from the other spoke. Every router ends up with a route to every subnet, without a single static route.

---

*Commands and outputs are from my lab run (2026-10-06). Formatted, with the config/policy breakdown and output explanations added, with help from Claude (AI-assisted).*
