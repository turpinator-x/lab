# Exercise 1 Results: Deploy and Verify

Topology: `host1 -- srl1 -- srl2 -- host2`

| Link | Subnet | Addresses |
|---|---|---|
| host1 ↔ srl1 | 10.1.1.0/24 | host1 `10.1.1.2`, srl1 e1-1 `10.1.1.1` |
| srl1 ↔ srl2 | 10.1.2.0/24 | srl1 e1-2 `10.1.2.1`, srl2 e1-1 `10.1.2.2` |
| srl2 ↔ host2 | 10.1.3.0/24 | srl2 e1-2 `10.1.3.1`, host2 `10.1.3.2` |

## Pings

| From | To | Same subnet? | Result |
|---|---|---|---|
| host1 | srl1 `10.1.1.1` | yes | ✅ succeeded |
| host2 | srl2 `10.1.3.1` | yes | ✅ succeeded |
| srl1 | srl2 `10.1.2.2` | yes | ✅ succeeded |
| host1 | host2 `10.1.3.2` | no | ❌ failed (100% loss) |

### host1 → srl1 (succeeded)

```
$ docker exec clab-ip-fundamentals-host1 ping -c 3 10.1.1.1
PING 10.1.1.1 (10.1.1.1): 56 data bytes
64 bytes from 10.1.1.1: seq=0 ttl=64 time=1.511 ms
64 bytes from 10.1.1.1: seq=1 ttl=64 time=1.446 ms
64 bytes from 10.1.1.1: seq=2 ttl=64 time=1.435 ms

--- 10.1.1.1 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
```

### host2 → srl2 (succeeded)

```
$ docker exec clab-ip-fundamentals-host2 ping -c 3 10.1.3.1
PING 10.1.3.1 (10.1.3.1): 56 data bytes
64 bytes from 10.1.3.1: seq=0 ttl=64 time=1.482 ms
64 bytes from 10.1.3.1: seq=1 ttl=64 time=0.446 ms
64 bytes from 10.1.3.1: seq=2 ttl=64 time=1.392 ms

--- 10.1.3.1 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
```

### srl1 → srl2 (succeeded)

```
A:srl1# ping 10.1.2.2 network-instance default
Using network instance default
PING 10.1.2.2 (10.1.2.2) 56(84) bytes of data.
64 bytes from 10.1.2.2: icmp_seq=1 ttl=64 time=95.6 ms
64 bytes from 10.1.2.2: icmp_seq=2 ttl=64 time=2.43 ms
64 bytes from 10.1.2.2: icmp_seq=3 ttl=64 time=1.93 ms
64 bytes from 10.1.2.2: icmp_seq=4 ttl=64 time=2.45 ms
64 bytes from 10.1.2.2: icmp_seq=5 ttl=64 time=1.67 ms
```

The slower first reply (95.6 ms) most likely included the ARP lookup for `10.1.2.2`; later pings used the cached MAC.

### host1 → host2 (failed)

```
$ docker exec clab-ip-fundamentals-host1 ping -c 3 10.1.3.2
PING 10.1.3.2 (10.1.3.2): 56 data bytes

--- 10.1.3.2 ping statistics ---
3 packets transmitted, 0 packets received, 100% packet loss
```

## ARP tables

### host1

```
$ docker exec clab-ip-fundamentals-host1 arp -n
? (10.1.1.1) at 1a:aa:02:ff:00:01 [ether]  on eth1
```

host1 only knows its gateway, srl1 (`10.1.1.1`). There is no entry for host2: ARP only resolves addresses on the local subnet, so host1 never ARPs for `10.1.3.2`.

### srl1

```
$ docker exec -it clab-ip-fundamentals-srl1 sr_cli -c "show arpnd arp-entries"
+--------------+--------------+-------------+---------+--------------------+------------------+
|  Interface   | Subinterface |  Neighbor   | Origin  | Link layer address |      Expiry      |
+==============+==============+=============+=========+====================+==================+
| ethernet-1/1 |            0 |    10.1.1.2 | dynamic | AA:C1:AB:04:37:9D  | 3 hours from now |
| ethernet-1/2 |            0 |    10.1.2.2 | dynamic | 1A:BE:03:FF:00:01  | 3 hours from now |
| mgmt0        |            0 | 172.20.20.1 | dynamic | 12:8F:53:74:65:9F  | 2 hours from now |
+--------------+--------------+-------------+---------+--------------------+------------------+
  Total entries : 3 (0 static, 3 dynamic)
```

- `ethernet-1/1` → host1 (`10.1.1.2`)
- `ethernet-1/2` → srl2 (`10.1.2.2`)
- `mgmt0` → the containerlab management network gateway (`172.20.20.1`), used for SSH/Ansible, not for lab traffic

## Routing tables

### host1

```
$ docker exec clab-ip-fundamentals-host1 ip route
default via 10.1.1.1 dev eth1
10.1.1.0/24 dev eth1 scope link  src 10.1.1.2
172.20.20.0/24 dev eth0 scope link  src 172.20.20.3
```

Anything outside `10.1.1.0/24` (and the management network) goes to the default gateway, srl1 at `10.1.1.1`.

### srl1

```
$ docker exec clab-ip-fundamentals-srl1 sr_cli -c "show network-instance default route-table ipv4-unicast summary"
| Prefix        | Route Type | Next-hop          | Next-hop Interface |
|---------------|------------|-------------------|--------------------|
| 10.1.1.0/24   | local      | 10.1.1.1 (direct) | ethernet-1/1.0     |
| 10.1.1.1/32   | host       | None (extract)    | None               |
| 10.1.1.255/32 | host       | None (broadcast)  |                    |
| 10.1.2.0/24   | local      | 10.1.2.1 (direct) | ethernet-1/2.0     |
| 10.1.2.1/32   | host       | None (extract)    | None               |
| 10.1.2.255/32 | host       | None (broadcast)  |                    |
IPv4 routes total : 6
```

(Columns trimmed for readability.) srl1 only has routes for its two directly connected subnets. There is no route to `10.1.3.0/24` and no default route.

## Why host1 → host2 fails

1. `10.1.3.2` is not in host1's subnet (`10.1.1.0/24`; the third octet is `.3`, not `.1`), so host1 sends the packet to its default gateway, srl1 (`10.1.1.1`), using the MAC it already has in its ARP table.
2. srl1 receives the packet but has no route to `10.1.3.0/24`, only its directly connected `10.1.1.0/24` and `10.1.2.0/24`, so it drops it.
3. To fix this, srl1 needs a route to `10.1.3.0/24` via srl2 (`10.1.2.2`), and srl2 needs a route back to `10.1.1.0/24` via srl1 (`10.1.2.1`) so the reply can return. These can be added as static routes (lesson 03) or learned with a dynamic routing protocol such as BGP (lessons 04 and 05).

---

*Commands and outputs are from my lab run. The write-up was formatted and edited with help from Claude (AI-assisted).*
