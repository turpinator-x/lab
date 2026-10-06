# Exercise 5 Results: Break/Fix -- Wrong ASN

Goal: see what happens when one BGP router expects the wrong AS number for its neighbor.

## Break it

Told srl2 that srl1 (`10.1.2.1`) is in AS 65099 instead of 65001:

```
$ docker exec -it clab-dynamic-routing-bgp-srl2 sr_cli
A:srl2# enter candidate
A:srl2# set / network-instance default protocols bgp neighbor 10.1.2.1 peer-as 65099
A:srl2# commit now
All changes have been committed. Leaving candidate mode.
```

## Symptom: the ping still works, the long way

```
$ docker exec clab-dynamic-routing-bgp-host2 ping -c 3 -W 2 10.1.1.2
64 bytes from 10.1.1.2: icmp_seq=1 ttl=61 time=0.403 ms
64 bytes from 10.1.1.2: icmp_seq=2 ttl=61 time=0.360 ms
64 bytes from 10.1.1.2: icmp_seq=3 ttl=61 time=0.328 ms
3 packets transmitted, 3 received, 0% packet loss
```

The course README expects this ping to fail. It doesn't, because of the srl2–srl3 link added in Exercise 2: with the srl1–srl2 session down, BGP routes host2 → host1 through **srl2 → srl3 → srl1**. The TTL shows it: **61** (3 routers) during the break vs **62** (2 routers, direct) after the fix.

## Diagnose: the session is stuck in Active on both sides

```
$ docker exec clab-dynamic-routing-bgp-srl2 sr_cli -c "show network-instance default protocols bgp neighbor"
| Peer     | Peer-AS | State       | Uptime        | [Rx/Active/Tx] |
|----------|---------|-------------|---------------|----------------|
| 10.1.2.1 | 65099   | active      | -             |                |
| 10.1.6.2 | 65003   | established | 0d:0h:27m:42s | [5/3/3]        |

$ docker exec clab-dynamic-routing-bgp-srl1 sr_cli -c "show network-instance default protocols bgp neighbor"
| Peer     | Peer-AS | State       | Uptime        | [Rx/Active/Tx] |
|----------|---------|-------------|---------------|----------------|
| 10.1.2.2 | 65002   | active      | -             |                |
| 10.1.3.2 | 65003   | established | 0d:0h:3m:28s  | [4/3/3]        |
```

- srl2 shows peer-AS **65099** (the wrong value) for srl1, state **active**.
- srl1 still expects 65002 for srl2 (correct), but its side is also **active**, because srl2 keeps tearing the session down.
- The other sessions (srl2–srl3, srl1–srl3) are **established** and carry the traffic.

It gets stuck in the Active state and can't reach Established, because srl2 doesn't recognize its neighbor.

## Explanation: AS mismatch in the OPEN message

When a BGP session starts, each router sends an **OPEN** message that includes a "My Autonomous System" field: its own ASN.

1. srl1 sends OPEN: "I'm AS **65001**".
2. srl2 compares that with the `peer-as` configured for `10.1.2.1`: **65099**. They don't match.
3. srl2 rejects it: it sends a BGP **NOTIFICATION** (OPEN message error, "bad peer AS") and closes the TCP connection.
4. Both routers fall back and retry, and fail the same way every time, so the session never gets past the OPEN exchange and both sides sit in **Active**.

The neighbor's IP address was correct; its identity (ASN) wasn't what srl2 was configured to expect. Both the neighbor IP and the peer ASN must match on each side for a session to come up. This is deliberate: BGP only peers with exactly who you configured.

## Fix

```
$ docker exec -it clab-dynamic-routing-bgp-srl2 sr_cli
A:srl2# enter candidate
A:srl2# set / network-instance default protocols bgp neighbor 10.1.2.1 peer-as 65001
A:srl2# commit now
All changes have been committed. Leaving candidate mode.
```

## Verify

```
$ docker exec clab-dynamic-routing-bgp-srl2 sr_cli -c "show network-instance default protocols bgp neighbor"
| Peer     | Peer-AS | State       | Uptime        | [Rx/Active/Tx] |
|----------|---------|-------------|---------------|----------------|
| 10.1.2.1 | 65001   | established | 0d:0h:0m:15s  | [4/2/4]        |
| 10.1.6.2 | 65003   | established | 0d:1h:29m:10s | [5/1/5]        |

$ docker exec clab-dynamic-routing-bgp-host2 ping -c 3 10.1.1.2
64 bytes from 10.1.1.2: icmp_seq=1 ttl=62 time=0.285 ms
64 bytes from 10.1.1.2: icmp_seq=2 ttl=62 time=0.278 ms
64 bytes from 10.1.1.2: icmp_seq=3 ttl=62 time=0.330 ms
3 packets transmitted, 3 received, 0% packet loss
```

Session established (15 seconds old), and host2 → host1 is back on the direct path (`ttl=62`).

## Takeaways

- A session stuck in **Active/Connect** usually means a config mismatch (wrong neighbor IP, wrong peer ASN) or no reachability to the neighbor.
- Check **both** sides: here only srl2 was misconfigured, but both showed Active.
- With a redundant path, BGP routed around the broken session, so connectivity survived. The TTL change is the clue that traffic took a different path.

---

*Commands and outputs are from my lab run (2026-10-06). The OPEN message / NOTIFICATION explanation and the note on why the ping still worked were added with help from Claude (AI-assisted).*
