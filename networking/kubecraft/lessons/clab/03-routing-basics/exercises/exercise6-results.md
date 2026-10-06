# Exercise 6 Results: Break/Fix -- Unreachable Next-Hop (Link Down)

Goal: understand that a configured route doesn't guarantee a working path when the link to its next hop is down.

## Break it

Disabled srl1's link to srl3:

```
$ docker exec -it clab-routing-basics-srl1 sr_cli
A:srl1# enter candidate
A:srl1# set / interface ethernet-1/3 admin-state disable
A:srl1# commit now
All changes have been committed. Leaving candidate mode.
```

## Symptom

```
$ docker exec clab-routing-basics-host1 ping -c 3 -W 2 10.1.5.2
PING 10.1.5.2 (10.1.5.2) 56(84) bytes of data.
From 10.1.1.1 icmp_seq=1 Destination Net Unreachable
From 10.1.1.1 icmp_seq=2 Destination Net Unreachable
From 10.1.1.1 icmp_seq=3 Destination Net Unreachable

--- 10.1.5.2 ping statistics ---
3 packets transmitted, 0 received, +3 errors, 100% packet loss, time 2064ms
```

Not silence: srl1 (`10.1.1.1`) sent an ICMP "Destination Net Unreachable", meaning srl1 has no usable route to `10.1.5.0/24`. host3 still exists; srl1 just can't reach it. (Compare Exercise 4, where the route existed and traffic vanished silently.)

## Diagnose

### Interface status

```
$ docker exec clab-routing-basics-srl1 sr_cli -c "show interface brief" | grep -E "ethernet-1/[123] |mgmt0"
| ethernet-1/1  | enable  | up   | 25G |
| ethernet-1/2  | enable  | up   | 25G |
| ethernet-1/3  | disable | down | 25G |
| mgmt0         | enable  | up   | 1G  |
```

`ethernet-1/3` (to srl3) is disabled and down.

### Routing table

```
$ docker exec clab-routing-basics-srl1 sr_cli -c "show network-instance default route-table ipv4-unicast summary" | grep -E "10.1.3|10.1.5|routes total"
IPv4 routes total                    : 7
```

No `10.1.3` or `10.1.5` lines at all, and the table went from 11 routes to 7. It lost four routes tied to ethernet-1/3:

| Route | Type | Why it went |
|---|---|---|
| 10.1.3.0/24 | local | ethernet-1/3 is down |
| 10.1.3.1/32 | host (srl1's own IP) | ethernet-1/3 is down |
| 10.1.3.255/32 | host (broadcast) | ethernet-1/3 is down |
| 10.1.5.0/24 | static | its next hop `10.1.3.2` is no longer reachable |

## Why a route can exist when the link is down

Two different places:

- **Config:** the static route `10.1.5.0/24 → 10.1.3.2` is still configured on srl1 (and still in `host_vars/srl1.yml`). Nothing deleted it.
- **Route table:** what srl1 actually uses to forward. The static route was **withdrawn** from here.

srl1 can only reach the next hop `10.1.3.2` through the connected `10.1.3.0/24` on ethernet-1/3. With the interface down, that connected route disappeared, the next hop became unreachable, and SR Linux pulled the static route out of the table. That's why host1 got "Destination Net Unreachable" instead of a black hole.

The static route stays in the config and can still be used again once there's an active link between the devices. Route existence in the config doesn't guarantee path availability.

Note: the course README suggests the route "may still exist" in the table. On SR Linux 24.10.1 it stays configured but is removed from the route table. Other vendors or setups may keep it, which is when a route can look present while the path is broken.

## Fix

```
A:srl1# enter candidate
A:srl1# set / interface ethernet-1/3 admin-state enable
A:srl1# commit now
```

## Verify

```
$ docker exec clab-routing-basics-host1 ping -c 3 -W 2 10.1.5.2
64 bytes from 10.1.5.2: icmp_seq=1 ttl=62 time=0.172 ms
64 bytes from 10.1.5.2: icmp_seq=2 ttl=62 time=0.196 ms
64 bytes from 10.1.5.2: icmp_seq=3 ttl=62 time=0.197 ms
3 packets transmitted, 3 received, 0% packet loss
```

Re-enabling the interface brought the connected route back, the next hop became reachable again, and the static route was reinstalled automatically, with no change to the route config.

## Takeaways

- Config is what you asked for; the route table is what the router is actually using. Check both.
- A static route depends on its next hop being reachable; if the link to it goes down, the route stops working (here, it's withdrawn from the table).
- Static routes don't adapt: srl1 didn't find another way to host3. Dynamic routing protocols (BGP, lessons 04–05) can re-route around failures when there's another path.

---

*Commands, outputs, the route count and the core explanation are from my lab run (2026-10-05). Corrected (ICMP error vs silence, config vs route table) and formatted with help from Claude (AI-assisted).*
