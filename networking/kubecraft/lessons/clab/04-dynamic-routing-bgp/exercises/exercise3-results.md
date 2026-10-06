# Exercise 3 Results: Break/Fix -- Missing Export Policy

Goal: show that a BGP session being **Established** doesn't mean routes are flowing.

## Break it

Removed srl3's export policies from its BGP peer group:

```
$ docker exec -it clab-dynamic-routing-bgp-srl3 sr_cli
A:srl3# enter candidate
A:srl3# delete / network-instance default protocols bgp group ebgp-peers export-policy
A:srl3# commit now
All changes have been committed. Leaving candidate mode.
```

## Symptom

```
$ docker exec clab-dynamic-routing-bgp-host1 ping -c 3 -W 2 10.1.5.2     # host1 → host3
From 10.1.1.1 icmp_seq=1 Destination Net Unreachable
From 10.1.1.1 icmp_seq=2 Destination Net Unreachable
From 10.1.1.1 icmp_seq=3 Destination Net Unreachable
3 packets transmitted, 0 received, +3 errors, 100% packet loss

$ docker exec clab-dynamic-routing-bgp-host2 ping -c 3 -W 2 10.1.5.2     # host2 → host3
From 10.1.4.1 icmp_seq=1 Destination Net Unreachable
From 10.1.4.1 icmp_seq=2 Destination Net Unreachable
From 10.1.4.1 icmp_seq=3 Destination Net Unreachable
3 packets transmitted, 0 received, +3 errors, 100% packet loss

$ docker exec clab-dynamic-routing-bgp-host3 ping -c 3 -W 2 10.1.1.2     # host3 → host1
3 packets transmitted, 0 received, 100% packet loss
```

| Ping | Result | Why |
|---|---|---|
| host1 → host3 | ❌ "Net Unreachable" from srl1 | srl1 never received `10.1.5.0/24`, so it has no route |
| host2 → host3 | ❌ "Net Unreachable" from srl2 | same on srl2 |
| host3 → host1 | ❌ silence | request reaches host1, but host1's reply to `10.1.5.2` dies at srl1 (no route back); srl1's error goes to host1, so host3 hears nothing |

Note: the course README says host3 → host1 should still work because srl3 still receives routes. In practice it fails, because the **return** path to host3's network is gone everywhere. A ping needs routes in both directions.

## Diagnose

```
$ docker exec clab-dynamic-routing-bgp-srl3 sr_cli -c "show network-instance default protocols bgp neighbor"
| Peer     | Group      | Peer-AS | State       | Uptime        | AFI/SAFI     | [Rx/Active/Tx] |
|----------|------------|---------|-------------|---------------|--------------|----------------|
| 10.1.3.1 | ebgp-peers | 65001   | established | 0d:0h:38m:7s  | ipv4-unicast | [5/2/0]        |
| 10.1.6.1 | ebgp-peers | 65002   | established | 0d:0h:9m:12s  | ipv4-unicast | [5/1/0]        |
```

- Both sessions are **established**: BGP itself is healthy.
- **Rx 5**: srl3 still receives routes from both neighbors (its import policy is untouched).
- **Tx 0**: srl3 sends **nothing** to either neighbor.

## Explanation: SR Linux default-deny export

TX is 0. There's no return path because there's no policy telling srl3 which routes to send, so it sends none.

SR Linux is **default-deny** for BGP: without an export policy it advertises no routes at all, and without an import policy it accepts none. Deleting `export-policy [export-connected export-bgp]` removed the only permission srl3 had to advertise its connected networks (including host3's `10.1.5.0/24`) and the routes it learned. The session stays up; it just has nothing to send. The rest of the network never hears about `10.1.5.0/24`, so traffic to host3 has nowhere to go.

## Fix

```
$ docker exec -it clab-dynamic-routing-bgp-srl3 sr_cli
A:srl3# enter candidate
A:srl3# set / network-instance default protocols bgp group ebgp-peers export-policy [export-connected export-bgp]
A:srl3# commit now
All changes have been committed. Leaving candidate mode.
```

## Verify

```
$ docker exec clab-dynamic-routing-bgp-host1 ping -c 3 10.1.5.2
64 bytes from 10.1.5.2: icmp_seq=1 ttl=62 time=0.320 ms
64 bytes from 10.1.5.2: icmp_seq=2 ttl=62 time=0.316 ms
64 bytes from 10.1.5.2: icmp_seq=3 ttl=62 time=0.237 ms
3 packets transmitted, 3 received, 0% packet loss
```

## Takeaways

- **Established ≠ routes flowing.** Check `[Rx/Active/Tx]`: a session with Tx 0 (or Rx 0) is up but useless in that direction.
- SR Linux needs explicit import and export policies; without them BGP exchanges nothing.
- A one-sided problem (srl3 can't advertise) still breaks pings in both directions, because replies need a route back.

---

*Commands and outputs are from my lab run (2026-10-06). The Tx 0 diagnosis is mine; the default-deny and return-path explanations were expanded and the write-up formatted with help from Claude (AI-assisted).*
