# Exercise 7 Results: Break/Fix -- Missing Link

## Break it

`exercises/broken-topology.clab.yml` was created with two SR Linux nodes and **no links**:

```yaml
name: broken-lab

topology:
  nodes:
    srl1:
      kind: srl
      image: ghcr.io/nokia/srlinux:24.10.1

    srl2:
      kind: srl
      image: ghcr.io/nokia/srlinux:24.10.1

  links: []
```

```
$ sudo clab deploy -t exercises/broken-topology.clab.yml
...
INFO Creating container name=srl2
INFO Creating container name=srl1
INFO Running postdeploy actions kind=srl node=srl2
INFO Running postdeploy actions kind=srl node=srl1
...
╭──────────────────────┬───────────────────────────────┬─────────┬───────────────────╮
│         Name         │           Kind/Image          │  State  │   IPv4/6 Address  │
├──────────────────────┼───────────────────────────────┼─────────┼───────────────────┤
│ clab-broken-lab-srl1 │ srl                           │ running │ 172.20.20.3       │
│                      │ ghcr.io/nokia/srlinux:24.10.1 │         │ 3fff:172:20:20::3 │
├──────────────────────┼───────────────────────────────┼─────────┼───────────────────┤
│ clab-broken-lab-srl2 │ srl                           │ running │ 172.20.20.2       │
│                      │ ghcr.io/nokia/srlinux:24.10.1 │         │ 3fff:172:20:20::2 │
╰──────────────────────┴───────────────────────────────┴─────────┴───────────────────╯
```

Both nodes are `running`, and there's no `Created link:` line in the deploy output.

## Symptom and diagnosis

```
$ docker exec -it clab-broken-lab-srl1 sr_cli -c "show interface brief" | grep -E "ethernet-1/1 |mgmt0"
| ethernet-1/1        | disable  | down     | 25G      |          |          |
| mgmt0               | enable   | up       | 1G       |          |          |

$ docker exec -it clab-broken-lab-srl2 sr_cli -c "show interface brief" | grep -E "ethernet-1/1 |mgmt0"
| ethernet-1/1        | disable  | down     | 25G      |          |          |
| mgmt0               | enable   | up       | 1G       |          |          |
```

Both containers are running, so it isn't a container problem. Compared with the working lab (`enable` / `up`), `ethernet-1/1` is `disable` / `down` on both nodes.

## Why `ethernet-1/1` is down

There are no links configured for srl1 and srl2 to ethernet-1/1 specified in the YAML file. That causes two problems at once:

1. **No cable:** with `links: []`, containerlab creates no veth pair, so the port has nothing to connect to (oper `down`).
2. **Disabled in config:** containerlab's default SR Linux config only enables the interfaces that appear in `links:`, so with no links the port is also switched off (admin `disable`).

Compare Exercise 6, where the link was lost after deploy: there the port was still `enable` (config intact) but `down` (no cable).

## Fix

Destroyed the broken lab, added the missing link to the topology file, and redeployed:

```
$ sudo clab destroy -t exercises/broken-topology.clab.yml --cleanup
INFO Destroying lab name=broken-lab
INFO Removed container name=clab-broken-lab-srl2
INFO Removed container name=clab-broken-lab-srl1
```

Fixed [`broken-topology.clab.yml`](broken-topology.clab.yml):

```yaml
  links:
    # Connect srl1's ethernet-1/1 to srl2's ethernet-1/1
    - endpoints: ["srl1:e1-1", "srl2:e1-1"]
```

```
$ sudo clab deploy -t exercises/broken-topology.clab.yml
...
INFO Created link: srl1:e1-1 ▪┄┄▪ srl2:e1-1
...
```

## Verify

```
$ docker exec -it clab-broken-lab-srl1 sr_cli -c "show interface brief" | grep -E "ethernet-1/1 |mgmt0"
| ethernet-1/1        | enable   | up       | 25G      |          |          |
| mgmt0               | enable   | up       | 1G       |          |          |

$ docker exec -it clab-broken-lab-srl2 sr_cli -c "show interface brief" | grep -E "ethernet-1/1 |mgmt0"
| ethernet-1/1        | enable   | up       | 25G      |          |          |
| mgmt0               | enable   | up       | 1G       |          |          |
```

`ethernet-1/1` is `enable` / `up` on both nodes. Adding the link fixed both problems: containerlab created the veth pair and its default config enabled the port.

## Running vs up

- **Running** is about the **container**: the router itself is powered on. `clab inspect` and `docker ps` report this.
- **Up** is about an **interface**: a specific port has a working connection. `show interface brief` reports this.

A node can be running while its links are down, either because the link was never defined (this exercise) or because it was lost (Exercise 6). When troubleshooting, check the interfaces, not just the container state.

---

*Commands and outputs are from my lab run. The diagnosis is mine; written up and expanded with help from Claude (AI-assisted).*
