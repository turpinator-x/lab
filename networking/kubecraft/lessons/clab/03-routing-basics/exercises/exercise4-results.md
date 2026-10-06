# Exercise 4 Results: Break/Fix -- Wrong Next-Hop (Black Hole)

Goal: see what happens when a static route points to a next-hop that doesn't exist.

## Break it

Changed srl1's next hop for host3's network (`10.1.5.0/24`) from srl3 (`10.1.3.2`) to an address no device owns (`10.1.3.99`):

```
$ docker exec -it clab-routing-basics-srl1 sr_cli
A:srl1# enter candidate
A:srl1# set / network-instance default next-hop-groups group nhg-10-1-5-0-24 nexthop 1 ip-address 10.1.3.99
A:srl1# commit now
All changes have been committed. Leaving candidate mode.
```

## Confirm the break: the route still looks fine

```
$ docker exec clab-routing-basics-srl1 sr_cli -c "show network-instance default route-table ipv4-unicast summary" | grep -E "10.1.5|routes total"
| 10.1.5.0/24 | 0 | static | static_route_mgr | True | default | 1 | 5 | 10.1.3.0/24 (indirect/local) | ethernet-1/3.0 |
IPv4 routes total                    : 11
```

The route is still there and still `Active: True`, with the same route count (11) as the working lab. Nothing in the routing table looks wrong: `10.1.3.99` sits inside the connected `10.1.3.0/24`, so SR Linux accepts it as a valid next hop.

## Symptom

```
$ docker exec clab-routing-basics-host1 ping -c 3 -W 2 10.1.5.2
PING 10.1.5.2 (10.1.5.2) 56(84) bytes of data.

--- 10.1.5.2 ping statistics ---
3 packets transmitted, 0 received, 100% packet loss, time 2051ms
```

Ping failed with silence (100% loss), not an ICMP "unreachable" error like Exercise 3, because srl1 did have a route.

## Diagnose: srl1's ARP table

```
$ docker exec clab-routing-basics-srl1 sr_cli -c "show arpnd arp-entries"
| Interface    | Subinterface | Neighbor    | Origin  | Link layer address | Expiry           |
|--------------|--------------|-------------|---------|--------------------|------------------|
| ethernet-1/1 | 0            | 10.1.1.2    | dynamic | AA:C1:AB:74:0F:39  | 3 hours from now |
| ethernet-1/2 | 0            | 10.1.2.2    | dynamic | 1A:7A:04:FF:00:01  | 2 hours from now |
| mgmt0        | 0            | 172.20.20.1 | dynamic | 22:CE:D7:2F:00:AA  | 2 hours from now |
  Total entries : 3 (0 static, 3 dynamic)
```

There's no entry for `10.1.3.99`. There's also nothing on `ethernet-1/3` at all: srl1 isn't talking to srl3 (`10.1.3.2`) any more, because the route sends everything to `.99` instead. SR Linux doesn't list failed lookups in this table, so the clue is the missing neighbor on `ethernet-1/3`, not an error line.

## Why a valid-looking route black-holes traffic

There is a hop to no device. srl1 needs the MAC address of `10.1.3.99` to complete the hop, but it can't get one because no device has that address.

In more detail: after choosing the route, srl1 has to deliver the packet to the next hop at layer 2, so it sends an ARP request ("who has 10.1.3.99?") out `ethernet-1/3`. Nobody on that link owns `10.1.3.99`, so nobody answers. Without a MAC address srl1 can't build the frame, so it drops the packet silently. Traffic goes in and nothing comes out: a **black hole**.

The routing table only checks that the next hop is on a connected subnet; it doesn't check that a device actually answers there.

## Fix

Restored the correct next hop (srl3):

```
A:srl1# enter candidate
A:srl1# set / network-instance default next-hop-groups group nhg-10-1-5-0-24 nexthop 1 ip-address 10.1.3.2
A:srl1# commit now
```

## Verify

```
$ docker exec clab-routing-basics-host1 ping -c 3 10.1.5.2
PING 10.1.5.2 (10.1.5.2) 56(84) bytes of data.
64 bytes from 10.1.5.2: icmp_seq=1 ttl=62 time=0.228 ms
64 bytes from 10.1.5.2: icmp_seq=2 ttl=62 time=0.198 ms
64 bytes from 10.1.5.2: icmp_seq=3 ttl=62 time=0.202 ms

--- 10.1.5.2 ping statistics ---
3 packets transmitted, 3 received, 0% packet loss
```

Back to `ttl=62` (two routers: srl1, srl3).

## Takeaways

- A route can be present and `Active` and still go nowhere. Routing decides *where* to send a packet; ARP decides *whether it can actually be delivered* to the next hop.
- When the routing table looks right but traffic vanishes, check the ARP table for the next hop.
- Silence (timeouts) vs an ICMP error is a clue: Exercise 3 (no route) produced "Destination Net Unreachable"; this exercise (route to a dead next hop) produced silence.

---

*Commands, outputs and the diagnosis are from my lab run (2026-10-05). The ARP explanation was expanded and the write-up formatted with help from Claude (AI-assisted).*
