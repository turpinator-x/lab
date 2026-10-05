# Exercise 5 Output: Add a Linux Host

Topology: [`mixed-topology.clab.yml`](mixed-topology.clab.yml): an SR Linux `router` and an Alpine Linux `host1`, linked `router:e1-1` ↔ `host1:eth1`.

## Deploy and inspect

```
$ sudo clab deploy -t exercises/mixed-topology.clab.yml
...
INFO Creating container name=host1
INFO Creating container name=router
INFO Created link: router:e1-1 ▪┄┄▪ host1:eth1
...
$ sudo clab inspect -t exercises/mixed-topology.clab.yml
╭───────────────────────┬───────────────────────────────┬─────────┬───────────────────╮
│          Name         │           Kind/Image          │  State  │   IPv4/6 Address  │
├───────────────────────┼───────────────────────────────┼─────────┼───────────────────┤
│ clab-mixed-top-host1  │ linux                         │ running │ 172.20.20.2       │
│                       │ alpine:3.20                   │         │ 3fff:172:20:20::2 │
├───────────────────────┼───────────────────────────────┼─────────┼───────────────────┤
│ clab-mixed-top-router │ srl                           │ running │ 172.20.20.3       │
│                       │ ghcr.io/nokia/srlinux:24.10.1 │         │ 3fff:172:20:20::3 │
╰───────────────────────┴───────────────────────────────┴─────────┴───────────────────╯
```

Both containers are running: a network OS (`srl`) and a plain Linux container (`linux`) in the same lab.

## Verify `eth1` in the Alpine host

```
$ docker exec -it clab-mixed-top-host1 sh
/ # ip addr show eth1
58: eth1@if59: <BROADCAST,MULTICAST,UP,LOWER_UP,M-DOWN> mtu 9500 qdisc noqueue state UP
    link/ether aa:c1:ab:9a:64:4e brd ff:ff:ff:ff:ff:ff
    inet6 fe80::a8c1:abff:fe9a:644e/64 scope link
       valid_lft forever preferred_lft forever
```

What this shows:

- `eth1` exists and is `UP`: containerlab created it as one end of the veth pair to the router's `e1-1` (`@if59` is the other end's interface index).
- There's no `inet` (IPv4) line because the topology doesn't assign an address. The only address is an automatic IPv6 link-local one (`fe80::...`). Lesson 02's topology adds IPv4 addresses with `exec:` commands.
- `mtu 9500`: containerlab sets a larger (jumbo) MTU on lab links by default.
- `eth0` (not shown) is the management interface (`172.20.20.2`), which is why the data link is `eth1`.

---

*Commands and outputs are from my lab run. Formatted, with the "What this shows" notes added, with help from Claude (AI-assisted).*
