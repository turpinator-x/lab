# Exercise 3 Results: Break/Fix -- Missing Route

Goal: understand what happens when one router is missing a route, and why both directions can break even though only one router is affected.

## Baseline (before the break)

Fresh deploy + Ansible config, all three paths working:

```
$ docker exec clab-routing-basics-host2 ping -c 3 -W 2 10.1.5.2
64 bytes from 10.1.5.2: icmp_seq=1 ttl=61 time=81.3 ms
...
3 packets transmitted, 3 received, 0% packet loss

$ docker exec clab-routing-basics-host3 ping -c 3 -W 2 10.1.4.2
64 bytes from 10.1.4.2: icmp_seq=1 ttl=61 time=0.395 ms
...
3 packets transmitted, 3 received, 0% packet loss

$ docker exec clab-routing-basics-host1 ping -c 3 -W 2 10.1.5.2
64 bytes from 10.1.5.2: icmp_seq=1 ttl=62 time=0.672 ms
...
3 packets transmitted, 3 received, 0% packet loss
```

## Break it

Removed srl2's static route to host3's network (and its next-hop-group):

```
$ docker exec -it clab-routing-basics-srl2 sr_cli
A:srl2# enter candidate
A:srl2# delete / network-instance default static-routes route 10.1.5.0/24
A:srl2# delete / network-instance default next-hop-groups group nhg-10-1-5-0-24
A:srl2# commit now
All changes have been committed. Leaving candidate mode.
```

## Confirm the break

```
$ docker exec clab-routing-basics-srl2 sr_cli -c "show network-instance default route-table ipv4-unicast summary" | grep -E "10.1.5|routes total"
IPv4 routes total                    : 8
```

srl2 went from 9 routes to 8, with no `10.1.5.0/24` line. Compared with srl2's table in Exercise 2, the missing row is:

```
| 10.1.5.0/24 | static | 5 | 10.1.2.0/24 (indirect/local) | ethernet-1/1.0 |   <- gone
```

That's the route telling srl2 how to reach host3's network. (The `/32` host rows like `10.1.2.2/32` and `10.1.4.1/32` are srl2's own addresses; they're unchanged and not involved.)

Lesson learned along the way: on an earlier attempt all three pings succeeded because the break hadn't actually been applied. Always confirm the break before testing the symptom.

## Symptom

```
$ docker exec clab-routing-basics-host2 ping -c 3 -W 2 10.1.5.2
PING 10.1.5.2 (10.1.5.2) 56(84) bytes of data.
From 10.1.4.1 icmp_seq=1 Destination Net Unreachable
From 10.1.4.1 icmp_seq=2 Destination Net Unreachable
From 10.1.4.1 icmp_seq=3 Destination Net Unreachable

--- 10.1.5.2 ping statistics ---
3 packets transmitted, 0 received, +3 errors, 100% packet loss, time 2081ms

$ docker exec clab-routing-basics-host3 ping -c 3 -W 2 10.1.4.2
PING 10.1.4.2 (10.1.4.2) 56(84) bytes of data.

--- 10.1.4.2 ping statistics ---
3 packets transmitted, 0 received, 100% packet loss, time 2082ms

$ docker exec clab-routing-basics-host1 ping -c 3 -W 2 10.1.5.2
PING 10.1.5.2 (10.1.5.2) 56(84) bytes of data.
64 bytes from 10.1.5.2: icmp_seq=1 ttl=62 time=0.248 ms
64 bytes from 10.1.5.2: icmp_seq=2 ttl=62 time=0.276 ms
64 bytes from 10.1.5.2: icmp_seq=3 ttl=62 time=0.273 ms

--- 10.1.5.2 ping statistics ---
3 packets transmitted, 3 received, 0% packet loss, time 2073ms
```

| Ping | Result | What host saw |
|---|---|---|
| host2 → host3 | ❌ | ICMP `Destination Net Unreachable` from `10.1.4.1` (srl2) |
| host3 → host2 | ❌ | silence, 100% loss |
| host1 → host3 | ✅ | normal replies, `ttl=62` |

## Why one missing route breaks both directions

Traced with the routing tables from Exercise 2, with srl2's `10.1.5.0/24` route missing.

### host2 → host3: forward path breaks

| Path | Hops | Result |
|---|---|---|
| Forward | host2 → **srl2**: no route for 10.1.5.0/24, no default | ❌ dropped at srl2 |

The packet never leaves srl2. srl2 sends an ICMP "Destination Net Unreachable" back to the sender, host2, which is exactly what host2's ping printed.

### host3 → host2: return path breaks

| Path | Hops | Result |
|---|---|---|
| Forward | host3 → srl3 → srl1 → srl2 → host2 (10.1.4.0/24 is local on srl2) | ✅ request arrives |
| Return | host2 → **srl2**: no route for 10.1.5.0/24 | ❌ reply dropped at srl2 |

The request gets all the way to host2, but host2's reply has to go back through srl2, which can't route it. srl2's "unreachable" message goes to the reply's sender (host2), not host3, so host3 just sees silence. That's why this ping timed out quietly instead of showing an error.

### host1 → host3: unaffected

| Path | Hops | Result |
|---|---|---|
| Forward | host1 → srl1 → srl3 → host3 | ✅ |
| Return | host3 → srl3 → srl1 → host1 | ✅ |

srl2 isn't on either path, so its missing route doesn't matter.

## Fix

Re-ran the Ansible playbook, which restores every route defined in `host_vars` (including srl2's `10.1.5.0/24 → 10.1.2.1`):

```
$ cd ansible && ansible-playbook -i inventory.yml playbook.yml && cd ..
...
PLAY RECAP
srl1 : ok=6  changed=0  unreachable=0  failed=0
srl2 : ok=6  changed=0  unreachable=0  failed=0
srl3 : ok=6  changed=0  unreachable=0  failed=0
```

The playbook's route-table output for srl2 confirms `10.1.5.0/24` is back (`static`, `active: True`, 9 routes total).

Manual alternative (inside srl2's `sr_cli`):

```
enter candidate
set / network-instance default next-hop-groups group nhg-10-1-5-0-24 admin-state enable
set / network-instance default next-hop-groups group nhg-10-1-5-0-24 nexthop 1 ip-address 10.1.2.1
set / network-instance default static-routes route 10.1.5.0/24 admin-state enable
set / network-instance default static-routes route 10.1.5.0/24 next-hop-group nhg-10-1-5-0-24
commit now
```

## Verify

```
$ docker exec clab-routing-basics-host2 ping -c 3 10.1.5.2
64 bytes from 10.1.5.2: icmp_seq=1 ttl=61 time=0.365 ms
64 bytes from 10.1.5.2: icmp_seq=2 ttl=61 time=1.06 ms
64 bytes from 10.1.5.2: icmp_seq=3 ttl=61 time=0.288 ms
3 packets transmitted, 3 received, 0% packet loss

$ docker exec clab-routing-basics-host3 ping -c 3 10.1.4.2
64 bytes from 10.1.4.2: icmp_seq=1 ttl=61 time=0.309 ms
64 bytes from 10.1.4.2: icmp_seq=2 ttl=61 time=0.269 ms
64 bytes from 10.1.4.2: icmp_seq=3 ttl=61 time=0.390 ms
3 packets transmitted, 3 received, 0% packet loss
```

Both directions back to `ttl=61` (three routers).

## Diagnostic commands used

- `show network-instance default route-table ipv4-unicast summary` on srl2: compared against the Exercise 2 table to find the missing row.
- `ping -W 2` from each host: which paths fail, and whether the failure is an ICMP error or silence.

## Takeaways

- A ping needs a route on every router in **both** directions. The forward and return paths are looked up separately.
- An ICMP "Destination Net Unreachable" from a router means that router has no route for *your* packet. Silence often means your request got through but the reply was lost on the way back.
- Compare before/after routing tables and look for the row that disappeared.
- Confirm a break (or a fix) took effect before testing.
- Re-running Ansible is a fast, reliable fix: it puts the device back to the intended config in `host_vars`.

---

*Commands and outputs are from my lab run (2026-10-05). The path traces and explanations were written with help from Claude (AI-assisted).*
