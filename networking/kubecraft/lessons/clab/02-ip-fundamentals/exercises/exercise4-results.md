# Exercise 4 Results: Break/Fix -- Interface Down

Goal: diagnose and fix an interface that has been administratively disabled on srl1.

Baseline before breaking it: `host1 → srl1 (10.1.1.1)` ping succeeded.

## Break it

```
$ docker exec -it clab-ip-fundamentals-srl1 sr_cli
A:srl1# enter candidate
A:srl1# set / interface ethernet-1/1 admin-state disable
A:srl1# commit now
All changes have been committed. Leaving candidate mode.
```

## Symptom

```
$ docker exec clab-ip-fundamentals-host1 ping -c 3 -W 1 10.1.1.1
PING 10.1.1.1 (10.1.1.1): 56 data bytes

--- 10.1.1.1 ping statistics ---
3 packets transmitted, 0 packets received, 100% packet loss
```

host1 can no longer reach its directly connected gateway.

## Diagnose

```
A:srl1# show interface brief
+---------------+-------------+------------+-------+
|     Port      | Admin State | Oper State | Speed |
+===============+=============+============+=======+
| ethernet-1/1  | disable     | down       | 25G   |
| ethernet-1/2  | enable      | up         | 25G   |
| ethernet-1/3  | disable     | down       | 25G   |
| ...           | ...         | ...        | ...   |
| lo0           | enable      | up         |       |
| mgmt0         | enable      | up         | 1G    |
+---------------+-------------+------------+-------+
```

(Trimmed: `ethernet-1/3` through `ethernet-1/58` are unused and `disable` / `down` by default. Empty columns removed.)

`ethernet-1/1` (the link to host1) is `disable` / `down`, while `ethernet-1/2` (the link to srl2) is still `enable` / `up`.

**Admin state is disabled, so it's a config problem.** Admin state is what's configured; oper state is what's actually happening. If admin were `enable` and only oper were `down`, it would point to a cable or far-end problem instead.

## Fix

```
$ docker exec -it clab-ip-fundamentals-srl1 sr_cli
A:srl1# enter candidate
A:srl1# set / interface ethernet-1/1 admin-state enable
A:srl1# commit now
All changes have been committed. Leaving candidate mode.
```

## Verify

```
$ docker exec clab-ip-fundamentals-host1 ping -c 3 -W 1 10.1.1.1
PING 10.1.1.1 (10.1.1.1): 56 data bytes
64 bytes from 10.1.1.1: seq=0 ttl=64 time=19.074 ms
64 bytes from 10.1.1.1: seq=1 ttl=64 time=1.887 ms
64 bytes from 10.1.1.1: seq=2 ttl=64 time=1.802 ms

--- 10.1.1.1 ping statistics ---
3 packets transmitted, 3 packets received, 0% packet loss
```

Connectivity restored. (The slower first reply most likely included a fresh ARP lookup after the link came back.)

## Takeaways

- `show interface brief` is the first check when a directly connected neighbor stops answering.
- Admin vs oper state tells you whether to look at config (admin) or at the physical/far side (oper).
- SR Linux changes only take effect after `commit`, both when breaking and when fixing.
- Re-running the Ansible playbook would also have fixed it, because the template sets `admin-state enable` on every interface in `host_vars`.

---

*Commands, outputs and diagnosis are from my lab run (2026-10-05). Formatted with help from Claude (AI-assisted).*
