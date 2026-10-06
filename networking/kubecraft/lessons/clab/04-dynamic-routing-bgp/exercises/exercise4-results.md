# Exercise 4 Results: Break/Fix -- Link Failure with Automatic Reroute

Goal: disable the srl1–srl3 link (the same break that permanently cut off host3 in lesson 03, exercise 6) and watch BGP find another path automatically.

Topology now has two ways from srl1 to host3:

- **Direct:** srl1 → srl3 (link `10.1.3.0/24`, AS path `[65003]`)
- **Backup:** srl1 → srl2 → srl3 (via the new `10.1.6.0/24` link from Exercise 2, AS path `[65002, 65003]`)

## Before: direct path

```
$ docker exec clab-dynamic-routing-bgp-host1 traceroute -n -w 2 10.1.5.2
 1  10.1.1.1   <- srl1
 2  10.1.3.2   <- srl3
 3  10.1.5.2   <- host3
```

## Break it

```
$ docker exec -it clab-dynamic-routing-bgp-srl1 sr_cli
A:srl1# enter candidate
A:srl1# set / interface ethernet-1/3 admin-state disable
A:srl1# commit now
All changes have been committed. Leaving candidate mode.
```

## Continuous ping (two runs)

Run 1, entirely **before** the break:

```
$ docker exec clab-dynamic-routing-bgp-host1 ping -c 30 -i 1 10.1.5.2
64 bytes from 10.1.5.2: icmp_seq=1 ttl=62 time=0.330 ms
...
64 bytes from 10.1.5.2: icmp_seq=30 ttl=62 time=0.292 ms
30 packets transmitted, 30 received, 0% packet loss
```

Run 2, entirely **after** the break:

```
$ docker exec clab-dynamic-routing-bgp-host1 ping -c 30 -i 1 10.1.5.2
64 bytes from 10.1.5.2: icmp_seq=1 ttl=61 time=0.397 ms
...
64 bytes from 10.1.5.2: icmp_seq=30 ttl=61 time=0.215 ms
30 packets transmitted, 30 received, 0% packet loss
```

The exact moment of failure fell between the two runs, so no packet loss was captured. The reroute is visible in the TTL: **62 → 61**, i.e. one extra router in the path after the break.

## During the outage

```
$ docker exec clab-dynamic-routing-bgp-srl1 sr_cli -c "show network-instance default protocols bgp neighbor"
| Peer     | Peer-AS | State       | Uptime        | [Rx/Active/Tx] |
|----------|---------|-------------|---------------|----------------|
| 10.1.2.2 | 65002   | established | 0d:0h:51m:48s | [4/3/2]        |
| 10.1.3.2 | 65003   | active      | -             |                |

$ docker exec clab-dynamic-routing-bgp-host1 traceroute -n -w 2 10.1.5.2
 1  10.1.1.1   <- srl1
 2  10.1.2.2   <- srl2
 3  10.1.6.2   <- srl3 (via the srl2–srl3 link)
 4  10.1.5.2   <- host3
```

- The session to srl3 dropped to **active** (trying to reconnect over a dead link).
- The session to srl2 stayed **established** and now carries the routes for host3's network.
- Traffic took the backup path: 4 hops instead of 3.

## Restore the link

```
A:srl1# enter candidate
A:srl1# set / interface ethernet-1/3 admin-state enable
A:srl1# commit now
```

```
$ docker exec clab-dynamic-routing-bgp-srl1 sr_cli -c "show network-instance default protocols bgp neighbor"
| Peer     | Peer-AS | State       | Uptime        | [Rx/Active/Tx] |
|----------|---------|-------------|---------------|----------------|
| 10.1.2.2 | 65002   | established | 0d:0h:54m:33s | [4/3/3]        |
| 10.1.3.2 | 65003   | established | 0d:0h:0m:3s   | [0/0/0]        |

$ docker exec clab-dynamic-routing-bgp-host1 traceroute -n -w 2 10.1.5.2
 1  10.1.1.1   <- srl1
 2  10.1.3.2   <- srl3
 3  10.1.5.2   <- host3
```

The srl3 session came back (captured 3 seconds after it re-established, before routes had been exchanged, hence `[0/0/0]`), and traffic moved back to the shorter direct path on its own.

## BGP convergence

Traffic was rerouted to the next best available established path.

What happened step by step:

1. **Link down detected:** disabling `ethernet-1/3` took the interface down immediately, so srl1 knew at once the link to srl3 was gone.
2. **Session drops:** the eBGP session to srl3 (running over that link) went down.
3. **Routes withdrawn:** every route srl1 had learned from srl3, including `10.1.5.0/24` via `[65003]`, was removed.
4. **Next best path chosen:** srl1 already had a second copy of `10.1.5.0/24` from srl2 with AS path `[65002, 65003]`. With the shorter path gone, the best-path algorithm picked this one.
5. **Forwarding updated:** the new route was installed and traffic flowed srl1 → srl2 → srl3.

When the link came back, the session re-established, srl3's shorter `[65003]` path returned, and the best-path algorithm switched back to it.

This **convergence** happened in well under a second here because an admin-disabled interface is detected instantly. In a real outage where the link stays up but the far router dies, BGP may only notice when its hold timer expires (tens of seconds by default); networks add **BFD** (Bidirectional Forwarding Detection) to detect failures in milliseconds.

## Compared with lesson 03

| | Lesson 03 (static routes) | Lesson 04 (BGP) |
|---|---|---|
| srl1–srl3 link disabled | host3 unreachable until the link was re-enabled | traffic rerouted via srl2 automatically |
| Link restored | routes came back | traffic moved back to the shortest path automatically |

---

*Commands and outputs are from my lab run (2026-10-06). The loss/recovery moment wasn't captured (break happened between ping runs). Convergence explanation expanded and write-up formatted with help from Claude (AI-assisted).*
