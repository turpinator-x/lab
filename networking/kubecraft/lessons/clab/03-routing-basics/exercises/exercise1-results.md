# Exercise 1 Results: Deploy, Configure, and Verify End-to-End

Hub-and-spoke topology: srl1 is the hub, srl2 and srl3 are spokes, each with one host.

```
host1 (10.1.1.2) -- srl1 (hub) -- srl2 -- host2 (10.1.4.2)
                       |
                      srl3 -- host3 (10.1.5.2)
```

| Link | Subnet |
|---|---|
| host1 ↔ srl1 | 10.1.1.0/24 |
| srl1 ↔ srl2 | 10.1.2.0/24 |
| srl1 ↔ srl3 | 10.1.3.0/24 |
| srl2 ↔ host2 | 10.1.4.0/24 |
| srl3 ↔ host3 | 10.1.5.0/24 |

Deployed with `sudo clab deploy -t topology/lab.clab.yml`, configured with `ansible-playbook -i inventory.yml playbook.yml` (interfaces + static routes on all three routers).

## Pings

All pings succeeded.

| From | To | Type | TTL | Result |
|---|---|---|---|---|
| host1 | srl1 `10.1.1.1` | same subnet | 64 | ✅ |
| host2 | srl2 `10.1.4.1` | same subnet | 64 | ✅ |
| host3 | srl3 `10.1.5.1` | same subnet | 64 | ✅ |
| host1 | host2 `10.1.4.2` | cross-subnet (2 routers) | 62 | ✅ |
| host1 | host3 `10.1.5.2` | cross-subnet (2 routers) | 62 | ✅ |
| host2 | host3 `10.1.5.2` | cross-subnet (3 routers) | 61 | ✅ |
| host1 | srl2 `10.1.4.1` | bonus: across srl1 | 63 | ✅ |
| host1 | srl3 `10.1.5.1` | bonus: across srl1 | 63 | ✅ |

The replies start with TTL 64 and each router on the way back subtracts 1, so **64 − TTL = number of routers crossed**.

### Same subnet

```
$ docker exec clab-routing-basics-host1 ping -c 3 10.1.1.1
64 bytes from 10.1.1.1: icmp_seq=1 ttl=64 time=1.20 ms
64 bytes from 10.1.1.1: icmp_seq=2 ttl=64 time=1.19 ms
64 bytes from 10.1.1.1: icmp_seq=3 ttl=64 time=1.14 ms
3 packets transmitted, 3 received, 0% packet loss

$ docker exec clab-routing-basics-host2 ping -c 3 10.1.4.1
64 bytes from 10.1.4.1: icmp_seq=1 ttl=64 time=1.21 ms
64 bytes from 10.1.4.1: icmp_seq=2 ttl=64 time=2.06 ms
64 bytes from 10.1.4.1: icmp_seq=3 ttl=64 time=1.72 ms
3 packets transmitted, 3 received, 0% packet loss

$ docker exec clab-routing-basics-host3 ping -c 3 10.1.5.1
64 bytes from 10.1.5.1: icmp_seq=1 ttl=64 time=0.536 ms
64 bytes from 10.1.5.1: icmp_seq=2 ttl=64 time=1.04 ms
64 bytes from 10.1.5.1: icmp_seq=3 ttl=64 time=0.959 ms
3 packets transmitted, 3 received, 0% packet loss
```

### Cross-subnet (end to end)

```
$ docker exec clab-routing-basics-host1 ping -c 3 10.1.4.2
64 bytes from 10.1.4.2: icmp_seq=1 ttl=62 time=74.8 ms
64 bytes from 10.1.4.2: icmp_seq=2 ttl=62 time=0.223 ms
64 bytes from 10.1.4.2: icmp_seq=3 ttl=62 time=0.509 ms
3 packets transmitted, 3 received, 0% packet loss

$ docker exec clab-routing-basics-host1 ping -c 3 10.1.5.2
64 bytes from 10.1.5.2: icmp_seq=1 ttl=62 time=0.306 ms
64 bytes from 10.1.5.2: icmp_seq=2 ttl=62 time=0.294 ms
64 bytes from 10.1.5.2: icmp_seq=3 ttl=62 time=0.381 ms
3 packets transmitted, 3 received, 0% packet loss

$ docker exec clab-routing-basics-host2 ping -c 3 10.1.5.2
64 bytes from 10.1.5.2: icmp_seq=1 ttl=61 time=77.3 ms
64 bytes from 10.1.5.2: icmp_seq=2 ttl=61 time=0.384 ms
64 bytes from 10.1.5.2: icmp_seq=3 ttl=61 time=0.299 ms
3 packets transmitted, 3 received, 0% packet loss
```

The slow first reply (~75 ms) is the routers along the path resolving each next hop's MAC with ARP for the first time.

### Bonus: host1 to the spoke routers

```
$ docker exec clab-routing-basics-host1 ping -c 3 10.1.4.1
64 bytes from 10.1.4.1: icmp_seq=1 ttl=63 time=1.55 ms
...
3 packets transmitted, 3 received, 0% packet loss

$ docker exec clab-routing-basics-host1 ping -c 3 10.1.5.1
64 bytes from 10.1.5.1: icmp_seq=1 ttl=63 time=0.824 ms
...
3 packets transmitted, 3 received, 0% packet loss
```

This is the lesson 02 cliffhanger fixed: in lesson 02, host1 couldn't reach anything beyond its own router because there were no routes for remote subnets.

## srl1 routing table

```
$ docker exec clab-routing-basics-srl1 sr_cli -c "show network-instance default route-table ipv4-unicast summary"
| Prefix        | Route Type | Active | Metric | Pref | Next-hop (Type)            | Next-hop Interface |
|---------------|------------|--------|--------|------|----------------------------|--------------------|
| 10.1.1.0/24   | local      | True   | 0      | 0    | 10.1.1.1 (direct)          | ethernet-1/1.0     |
| 10.1.1.1/32   | host       | True   | 0      | 0    | None (extract)             | None               |
| 10.1.1.255/32 | host       | True   | 0      | 0    | None (broadcast)           |                    |
| 10.1.2.0/24   | local      | True   | 0      | 0    | 10.1.2.1 (direct)          | ethernet-1/2.0     |
| 10.1.2.1/32   | host       | True   | 0      | 0    | None (extract)             | None               |
| 10.1.2.255/32 | host       | True   | 0      | 0    | None (broadcast)           |                    |
| 10.1.3.0/24   | local      | True   | 0      | 0    | 10.1.3.1 (direct)          | ethernet-1/3.0     |
| 10.1.3.1/32   | host       | True   | 0      | 0    | None (extract)             | None               |
| 10.1.3.255/32 | host       | True   | 0      | 0    | None (broadcast)           |                    |
| 10.1.4.0/24   | static     | True   | 1      | 5    | 10.1.2.0/24 (indirect/local) | ethernet-1/2.0   |
| 10.1.5.0/24   | static     | True   | 1      | 5    | 10.1.3.0/24 (indirect/local) | ethernet-1/3.0   |
IPv4 routes total : 11
```

(Columns trimmed for readability.)

### Local (directly connected) routes

Created automatically for each configured interface:

| Prefix | Interface | srl1's own IP |
|---|---|---|
| 10.1.1.0/24 | ethernet-1/1 (to host1) | 10.1.1.1 |
| 10.1.2.0/24 | ethernet-1/2 (to srl2) | 10.1.2.1 |
| 10.1.3.0/24 | ethernet-1/3 (to srl3) | 10.1.3.1 |

The `/32` `host` rows are srl1's own addresses and each subnet's broadcast address.

### Static routes

Configured by Ansible from `host_vars/srl1.yml`:

| Prefix | Next hop | Out interface | Reaches |
|---|---|---|---|
| 10.1.4.0/24 | 10.1.2.2 (srl2) | ethernet-1/2 | host2's subnet |
| 10.1.5.0/24 | 10.1.3.2 (srl3) | ethernet-1/3 | host3's subnet |

The table shows the next hop as `10.1.2.0/24 (indirect/local)`: that's SR Linux showing how it resolves the next hop `10.1.2.2`, which sits inside the directly connected `10.1.2.0/24`. The next-hop IPs themselves live in the next-hop-groups (`nhg-10-1-4-0-24`, `nhg-10-1-5-0-24`).

### Do they match `host_vars/srl1.yml`?

Yes. The file defines `10.1.4.0/24 → 10.1.2.2` and `10.1.5.0/24 → 10.1.3.2`, which is exactly what's installed.

### Preference

Local routes have `Pref 0`; static routes have `Pref 5`. When different route types offer the same prefix, the lower preference wins, so a directly connected route always beats a static one. (Longest prefix match is a separate rule: it chooses between different prefix lengths.)

---

*Commands, outputs and route identification are from my lab run (2026-10-05). Formatted and corrected (next-hop IPs, local-route wording, preference note) with help from Claude (AI-assisted).*
