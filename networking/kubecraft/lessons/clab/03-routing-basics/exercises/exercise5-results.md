# Exercise 5 Results: Break/Fix -- Routing Loop

Goal: see what happens when two routers send traffic back and forth in a loop, and how TTL stops it from looping forever.

## Pre-check: srl2's route is in place

The loop needs srl2's own `10.1.5.0/24` route (pointing back at the hub):

```
$ docker exec clab-routing-basics-srl2 sr_cli -c "show network-instance default route-table ipv4-unicast summary" | grep -E "10.1.5|routes total"
| 10.1.5.0/24 | 0 | static | static_route_mgr | True | default | 1 | 5 | 10.1.2.0/24 (indirect/local) | ethernet-1/1.0 |
IPv4 routes total                    : 9
```

## Break it

Pointed srl1's route for host3's network at srl2 (`10.1.2.2`) instead of srl3:

```
$ docker exec -it clab-routing-basics-srl1 sr_cli
A:srl1# enter candidate
A:srl1# set / network-instance default next-hop-groups group nhg-10-1-5-0-24 nexthop 1 ip-address 10.1.2.2
A:srl1# commit now
All changes have been committed. Leaving candidate mode.
```

Now the two routers disagree about who should forward `10.1.5.0/24`:

- srl1: "send 10.1.5.0/24 to srl2"
- srl2: "send 10.1.5.0/24 to srl1 (the hub)"

## Symptom

### Ping

```
$ docker exec clab-routing-basics-host1 ping -c 3 -W 2 10.1.5.2
PING 10.1.5.2 (10.1.5.2) 56(84) bytes of data.
From 10.1.2.1 icmp_seq=1 Redirect Network(New nexthop: 10.1.2.2)
From 10.1.2.1 icmp_seq=1 Redirect Network(New nexthop: 10.1.2.2)
From 10.1.2.1 icmp_seq=1 Redirect Network(New nexthop: 10.1.2.2)

--- 10.1.5.2 ping statistics ---
1 packets transmitted, 0 received, +3 errors, 100% packet loss, time 0ms
```

The ping fails. The `Redirect` messages come from srl1 (`10.1.2.1`): when the packet bounced back from srl2, srl1 noticed it was about to send it straight back out the same interface it arrived on, toward srl2. That's what an ICMP Redirect reports: "there's a better next hop on this link, use 10.1.2.2 directly." In a loop that advice is useless (and host1 isn't on that link anyway), but it's a hint that traffic is bouncing.

### Traceroute (broken)

```
$ docker exec clab-routing-basics-host1 traceroute -n -w 2 10.1.5.2
traceroute to 10.1.5.2 (10.1.5.2), 30 hops max, 60 byte packets
 1  * * *
 2  10.1.2.2  1.135 ms  1.147 ms  1.152 ms
 3  * * *
 4  10.1.2.2  1.127 ms  1.129 ms  1.132 ms
 5  * * *
 6  10.1.2.2  1.105 ms  0.894 ms  0.884 ms
 ...
26  * * *
27  * * *
28  10.1.2.2  1.819 ms  1.818 ms  1.816 ms
29  * * *
30  10.1.2.2  1.795 ms  1.793 ms  1.790 ms
```

(Hops 7–25 trimmed; they continue the same pattern.)

The loop pattern:

- **Even hops = srl2 (`10.1.2.2`)**, every time.
- **Odd hops = `* * *`**: these are srl1's turns. srl1 didn't send traceroute replies while looping (most likely ICMP rate-limiting while it was busy sending redirects). In the healthy trace below, srl1 does answer at hop 1.
- The trace never reaches `10.1.5.2` and gives up at the 30-hop maximum.

The packet ping-pongs srl1 → srl2 → srl1 → srl2 … and never gets anywhere.

### Traceroute (healthy, after the fix)

```
$ docker exec clab-routing-basics-host1 traceroute -n -w 2 10.1.5.2
traceroute to 10.1.5.2 (10.1.5.2), 30 hops max, 60 byte packets
 1  10.1.1.1  0.541 ms  0.525 ms  0.522 ms
 2  10.1.3.2  0.784 ms  0.785 ms  0.784 ms
 3  10.1.5.2  0.197 ms  0.201 ms  0.202 ms
```

Three hops: srl1 (`10.1.1.1`) → srl3 (`10.1.3.2`) → host3 (`10.1.5.2`).

## What is TTL, and why doesn't the loop go on forever?

TTL (Time To Live) is how many total hops a packet can go until it dies, so it doesn't loop forever.

More precisely: TTL is a counter in every IP packet's header. The sender sets it (Linux uses 64), and **every router subtracts 1** before forwarding. When a router decrements it to **0**, it discards the packet and sends an ICMP **"Time Exceeded"** message back to the sender. In this loop, each packet bounced between srl1 and srl2 until its TTL ran out, then it was dropped. Without TTL, looping packets would circle forever and pile up until the links were saturated.

This is the same counter seen in every ping reply: `ttl=62` means the reply crossed 64 − 62 = 2 routers.

## How traceroute uses TTL

(It doesn't use iptables, which is the Linux firewall from lesson 00. It uses TTL.)

Traceroute deliberately sends packets with a small TTL and counts up:

1. Send with **TTL 1**: the first router decrements it to 0, drops it, and replies "Time Exceeded" from its own address. That reveals **hop 1**.
2. Send with **TTL 2**: it expires at the second router, revealing **hop 2**.
3. Keep going (TTL 3, 4, 5 …) until the destination itself replies, or the 30-hop limit is reached.

`* * *` means no reply came back for that TTL within the timeout (`-w 2`). In the loop, TTL 2, 4, 6 … always expired at srl2 and TTL 1, 3, 5 … at srl1, which is why the hops alternate.

## Fix

Restored srl1's correct next hop (srl3):

```
A:srl1# enter candidate
A:srl1# set / network-instance default next-hop-groups group nhg-10-1-5-0-24 nexthop 1 ip-address 10.1.3.2
A:srl1# commit now
```

## Verify

```
$ docker exec clab-routing-basics-host1 ping -c 3 10.1.5.2
64 bytes from 10.1.5.2: icmp_seq=1 ttl=62 time=0.297 ms
64 bytes from 10.1.5.2: icmp_seq=2 ttl=62 time=0.276 ms
64 bytes from 10.1.5.2: icmp_seq=3 ttl=62 time=0.312 ms
3 packets transmitted, 3 received, 0% packet loss
```

Plus the healthy 3-hop traceroute above.

## Takeaways

- A routing loop happens when routers point at each other for the same destination. Each table looks reasonable on its own; the problem only shows when you follow the path.
- Traceroute is the tool for loops: a repeating pattern of the same addresses that never reaches the destination.
- TTL is the safety net: every router decrements it, and the packet is dropped at 0.
- ICMP Redirects from a router can hint that traffic is being sent back the way it came.

---

*Commands and outputs are from my lab run (2026-10-05). The TTL answer is mine; the traceroute, redirect and loop-pattern explanations were written with help from Claude (AI-assisted).*
