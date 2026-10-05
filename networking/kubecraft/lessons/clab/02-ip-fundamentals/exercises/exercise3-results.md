# Exercise 3 Results: Add a Loopback Interface

Goal: add a loopback interface to srl1 by changing only its Ansible data (`host_vars`), then push it with the existing playbook.

## Change: `ansible/host_vars/srl1.yml`

Added a third item (`lo0`) to the `interfaces` list:

```yaml
---
interfaces:
  - name: ethernet-1/1
    ipv4_address: 10.1.1.1/24
    description: Link to host1
  - name: ethernet-1/2
    ipv4_address: 10.1.2.1/24
    description: Link to srl2
  - name: lo0                          # added
    ipv4_address: 10.10.10.1/32        # added
    description: Loopback for management   # added
```

## Apply with Ansible

```
$ cd ansible
$ ansible-playbook -i inventory.yml playbook.yml
...
TASK [Display configured interfaces] *******************************************
ok: [srl1] => {
    "msg": "srl1 interfaces: [{'interface': [{'name': 'ethernet-1/1.0', 'oper-state': 'up', 'index': '2'}, {'name': 'ethernet-1/2.0', 'oper-state': 'up', 'index': '3'}, {'name': 'lo0.0', 'oper-state': 'up', 'index': '4'}]}]"
}
ok: [srl2] => {
    "msg": "srl2 interfaces: [{'interface': [{'name': 'ethernet-1/1.0', 'oper-state': 'up', 'index': '2'}, {'name': 'ethernet-1/2.0', 'oper-state': 'up', 'index': '3'}]}]"
}

PLAY RECAP *********************************************************************
srl1  : ok=4  changed=0  unreachable=0  failed=0  skipped=0  rescued=0  ignored=0
srl2  : ok=4  changed=0  unreachable=0  failed=0  skipped=0  rescued=0  ignored=0
```

srl1 now reports `lo0.0` as `up`. srl2 is unchanged because only srl1's `host_vars` were edited.

## Verify: `show interface lo0`

```
$ docker exec clab-ip-fundamentals-srl1 sr_cli -c "show interface lo0"
lo0 is up, speed None, type None
  lo0.0 is up
    Network-instances:
      * Name: default (default)
    Encapsulation   : null
    Type            : None
    IPv4 addr    : 10.10.10.1/32 (static, preferred, primary)
```

## Verify: srl1 route table

```
$ docker exec clab-ip-fundamentals-srl1 sr_cli -c "show network-instance default route-table ipv4-unicast summary"
| Prefix        | Route Type | Next-hop          | Next-hop Interface |
|---------------|------------|-------------------|--------------------|
| 10.1.1.0/24   | local      | 10.1.1.1 (direct) | ethernet-1/1.0     |
| 10.1.1.1/32   | host       | None (extract)    | None               |
| 10.1.1.255/32 | host       | None (broadcast)  |                    |
| 10.1.2.0/24   | local      | 10.1.2.1 (direct) | ethernet-1/2.0     |
| 10.1.2.1/32   | host       | None (extract)    | None               |
| 10.1.2.255/32 | host       | None (broadcast)  |                    |
| 10.10.10.1/32 | host       | None (extract)    | None               |   <- new
IPv4 routes total : 7
```

(Columns trimmed for readability.) The route count went from 6 to 7.

## Think about it

### Why was the loopback configured without changing the template?

The template contains a loop, `{% for iface in interfaces %}`, that writes the same six commands once for every item in the `interfaces` list. It doesn't care how many items there are. Adding a third item to `srl1.yml` simply made the loop run a third time with `lo0`'s values. The logic (template) and the data (`host_vars`) are separate, so adding a device or interface only means adding data.

### What does `/32` mean, and why did it add only one route?

The number after the slash is the prefix length: how many of the IPv4 address's 32 bits belong to the network. It is not the sum of the octets. `/24` means the first 24 bits (three octets) are the network and the last 8 bits are for hosts (2^8 = 256 addresses). `/32` means all 32 bits are the network and 0 bits are left for hosts, so 2^0 = 1 address: just `10.10.10.1`.

Because a /32 is a single address, there's no separate network or broadcast address to route. That's why the loopback added one `host` route, while each /24 link added three (network, srl1's own IP, broadcast).

### Why give a router a loopback address?

A loopback is a virtual interface that isn't tied to any physical port, so it never goes down because a cable is unplugged or a link fails. As long as the router is running and the network has at least one working path (and a route) to it, its loopback address stays reachable, even if the specific link you'd normally use is down. That makes it a stable identity for the router, used for:

- **Management:** SSH, monitoring and automation target one address that doesn't change when links do.
- **Router ID:** routing protocols use it to identify the router.
- **Routing protocol sessions:** BGP and others often peer between loopbacks so a single link failure doesn't drop the session (comes up in lessons 04 and 05).

---

*Commands and outputs are from my lab run. The write-up and the "Think about it" explanations were written with help from Claude (AI-assisted).*
