# Exercise 6 Results: Break/Fix -- Missing Gateway

Goal: understand why a default route (gateway) is needed to reach other subnets.

## Break it

```
$ docker exec clab-ip-fundamentals-host1 ip route del default
```

## Symptom

```
$ docker exec clab-ip-fundamentals-host1 ping -c 3 -W 1 10.1.1.1
PING 10.1.1.1 (10.1.1.1): 56 data bytes
64 bytes from 10.1.1.1: seq=0 ttl=64 time=1.853 ms
64 bytes from 10.1.1.1: seq=1 ttl=64 time=1.752 ms
64 bytes from 10.1.1.1: seq=2 ttl=64 time=1.652 ms

--- 10.1.1.1 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss

$ docker exec clab-ip-fundamentals-host1 ping -c 3 -W 1 10.1.2.1
PING 10.1.2.1 (10.1.2.1): 56 data bytes
ping: sendto: Network unreachable
```

- `10.1.1.1` (same subnet) **works**.
- `10.1.2.1` (different subnet) fails **instantly** with "Network unreachable": host1 has no route, so it doesn't send anything (same clue as Exercise 5).

## Diagnose

```
$ docker exec clab-ip-fundamentals-host1 ip route show
10.1.1.0/24 dev eth1 scope link  src 10.1.1.2
172.20.20.0/24 dev eth0 scope link  src 172.20.20.2
```

Only the directly connected networks are left: the lab link (`10.1.1.0/24`) and the containerlab management network (`172.20.20.0/24`). There's no `default` line, and `10.1.2.1` isn't in host1's routing table, so there's no route to it.

### Why does 10.1.1.1 work but 10.1.2.1 doesn't?

Both are srl1's addresses, but host1 only knows srl1 as `10.1.1.1` on its own subnet. `10.1.1.1` matches the connected `10.1.1.0/24` route, so host1 ARPs for srl1's MAC and sends directly. `10.1.2.1` is on srl1's other interface, in `10.1.2.0/24`, which host1 has no route for. Without a default route, host1 has no way to know it should hand that packet to srl1.

## Fix

```
$ docker exec clab-ip-fundamentals-host1 ip route add default via 10.1.1.1 dev eth1

$ docker exec clab-ip-fundamentals-host1 ip route show
default via 10.1.1.1 dev eth1
10.1.1.0/24 dev eth1 scope link  src 10.1.1.2
172.20.20.0/24 dev eth0 scope link  src 172.20.20.2
```

The default route is a catch-all: "anything not on my local subnet, send to `10.1.1.1`." host1 still doesn't know `10.1.2.0/24` exists; it just hands the packet to srl1, which owns `10.1.2.1` and replies. The gateway has to be on host1's local subnet so host1 can ARP for its MAC.

## Verify

```
$ docker exec clab-ip-fundamentals-host1 ping -c 3 -W 1 10.1.2.1
PING 10.1.2.1 (10.1.2.1): 56 data bytes
64 bytes from 10.1.2.1: seq=0 ttl=64 time=2.068 ms
64 bytes from 10.1.2.1: seq=1 ttl=64 time=1.923 ms
64 bytes from 10.1.2.1: seq=2 ttl=64 time=1.825 ms

--- 10.1.2.1 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
```

This works because srl1 owns `10.1.2.1` itself and already has a connected route back to `10.1.1.0/24`. Pinging host2 (`10.1.3.2`) would still fail, because srl1 has no route to `10.1.3.0/24` yet (see Exercise 1; fixed in lesson 03).

## Local vs remote subnets, and why gateways are needed

- **Local subnet:** devices on my existing subnet. I reach them directly: ARP for their MAC and send.
- **Remote subnet:** a device on an external subnet from the local host. I can't reach it directly, because ARP only works on the local network.
- **Gateway:** the router on my local subnet that I hand remote traffic to, so it can forward it on. Without one, a host can only talk to its own subnet, which is exactly what happened here.

---

*Commands, outputs and answers are from my lab run (2026-10-05). Explanations tightened and formatted with help from Claude (AI-assisted).*
