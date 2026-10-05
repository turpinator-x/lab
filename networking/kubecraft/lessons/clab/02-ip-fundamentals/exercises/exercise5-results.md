# Exercise 5 Results: Break/Fix -- Subnet Mismatch

Goal: diagnose a connectivity failure caused by a wrong IP address and subnet mask on host1.

## Break it

```
$ docker exec clab-ip-fundamentals-host1 ip addr del 10.1.1.2/24 dev eth1
$ docker exec clab-ip-fundamentals-host1 ip addr add 10.1.1.200/30 dev eth1
```

## Symptom

```
$ docker exec clab-ip-fundamentals-host1 ping -c 3 -W 1 10.1.1.1
PING 10.1.1.1 (10.1.1.1): 56 data bytes
ping: sendto: Network unreachable
```

The ping fails **instantly** with an error instead of timing out (compare Exercise 4's 100% packet loss). That means host1 refused to send the packet at all, which points at host1's own configuration.

## Diagnose

```
$ docker exec clab-ip-fundamentals-host1 ip addr show eth1
100: eth1@if101: <BROADCAST,MULTICAST,UP,LOWER_UP,M-DOWN> mtu 9500 qdisc noqueue state UP
    link/ether aa:c1:ab:12:1f:c0 brd ff:ff:ff:ff:ff:ff
    inet 10.1.1.200/30 scope global eth1
    inet6 fe80::a8c1:abff:fe12:1fc0/64 scope link

$ docker exec clab-ip-fundamentals-host1 ip route
10.1.1.200/30 dev eth1 scope link  src 10.1.1.200
172.20.20.0/24 dev eth0 scope link  src 172.20.20.2
```

- The interface is up, but its address is now `10.1.1.200/30`.
- The only lab route is `10.1.1.200/30`, and the default route (`via 10.1.1.1`) is **gone**: deleting the original address also removed the routes that depended on it.

### The /30 math

| | Address |
|---|---|
| Network | `10.1.1.200` |
| Usable | `10.1.1.201` to `10.1.1.202` |
| Broadcast | `10.1.1.203` |

How to get there (block-size method):

1. Host bits = 32 − 30 = **2**.
2. Block size = 2² = **4** addresses.
3. /30 blocks start at multiples of 4: 0, 4, 8 … 196, **200**, 204 …
4. 200 ÷ 4 = 50 exactly, so `.200` starts a block: `.200` (network) to `.203` (broadcast).
5. `10.1.1.1` is in the block `.0` to `.3`, a different subnet.

### Why host1 couldn't reach .1

`10.1.1.1` is outside the `.200`–`.203` range and isn't in host1's routing table, so host1 couldn't reach `.1` because it's on a different subnet. With no route for it (and the default route gone), the kernel had nowhere to send the packet and failed with "Network unreachable".

srl1 is unchanged (`10.1.1.1/24`, covering `.0` to `.255`) and still considers host1 local. The two ends of the link disagree about the subnet, which is the mismatch.

## Fix

```
$ docker exec clab-ip-fundamentals-host1 ip addr del 10.1.1.200/30 dev eth1
$ docker exec clab-ip-fundamentals-host1 ip addr add 10.1.1.2/24 dev eth1

$ docker exec clab-ip-fundamentals-host1 ip route
10.1.1.0/24 dev eth1 scope link  src 10.1.1.2
172.20.20.0/24 dev eth0 scope link  src 172.20.20.2
```

Restoring the address brought back the connected `10.1.1.0/24` route but **not** the default route, so it had to be re-added:

```
$ docker exec clab-ip-fundamentals-host1 ip route add default via 10.1.1.1 dev eth1
```

## Verify

```
$ docker exec clab-ip-fundamentals-host1 ping -c 3 -W 1 10.1.1.1
PING 10.1.1.1 (10.1.1.1): 56 data bytes
64 bytes from 10.1.1.1: seq=0 ttl=64 time=3.117 ms
64 bytes from 10.1.1.1: seq=1 ttl=64 time=1.109 ms
64 bytes from 10.1.1.1: seq=2 ttl=64 time=2.015 ms

--- 10.1.1.1 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
```

## How subnet masks decide what is "local"

A host compares each destination against its own address and mask:

- **Inside my subnet (local):** send directly on the wire (ARP for the destination's MAC).
- **Outside my subnet (remote):** send to the default gateway (ARP for the gateway's MAC).

With `10.1.1.2/24`, host1's subnet is `.0`–`.255`, so `.1` is local. With `10.1.1.200/30`, it shrinks to `.200`–`.203`, so `.1` becomes remote, and there was no gateway route left to reach it. Both ends of a link must use the same subnet.

## Takeaways

- An **instant** "Network unreachable" means the host has no route: check the host's own address and routes. A **timeout** means packets left but nothing came back: look further out.
- Removing an address can silently remove routes that depended on it (here, the default route). Always re-check `ip route` after changing addresses.

---

*Commands, outputs, the /30 math and the diagnosis are from my lab run (2026-10-05). The block-size method explanation and formatting were added with help from Claude (AI-assisted).*
