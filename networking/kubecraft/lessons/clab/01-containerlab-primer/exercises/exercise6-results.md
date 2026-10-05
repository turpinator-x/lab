# Exercise 6 Results: Break/Fix -- Container Stopped

Lab: `topology/lab.clab.yml` (`srl1:e1-1` ↔ `srl2:e1-1`)

## Break it

```
$ docker stop clab-first-lab-srl2
clab-first-lab-srl2
```

## Symptom

```
$ docker exec -it clab-first-lab-srl2 sr_cli
Error response from daemon: container 3935b023f272... is not running
```

## Diagnose

### Containerlab's view

```
$ sudo clab inspect -t topology/lab.clab.yml
╭─────────────────────┬───────────────────────────────┬─────────┬───────────────────╮
│         Name        │           Kind/Image          │  State  │   IPv4/6 Address  │
├─────────────────────┼───────────────────────────────┼─────────┼───────────────────┤
│ clab-first-lab-srl1 │ srl                           │ running │ 172.20.20.2       │
│                     │ ghcr.io/nokia/srlinux:24.10.1 │         │ 3fff:172:20:20::2 │
├─────────────────────┼───────────────────────────────┼─────────┼───────────────────┤
│ clab-first-lab-srl2 │ srl                           │ exited  │ N/A               │
│                     │ ghcr.io/nokia/srlinux:24.10.1 │         │ N/A               │
╰─────────────────────┴───────────────────────────────┴─────────┴───────────────────╯
```

srl2 is `exited` and has lost its management IP.

### Docker's view: `docker ps` vs `docker ps -a`

```
$ docker ps --filter name=clab-first-lab
CONTAINER ID   IMAGE                           STATUS         NAMES
609b21714a1d   ghcr.io/nokia/srlinux:24.10.1   Up 7 minutes   clab-first-lab-srl1

$ docker ps -a --filter name=clab-first-lab
CONTAINER ID   IMAGE                           STATUS                       NAMES
3935b023f272   ghcr.io/nokia/srlinux:24.10.1   Exited (143) 4 minutes ago   clab-first-lab-srl2
609b21714a1d   ghcr.io/nokia/srlinux:24.10.1   Up 7 minutes                 clab-first-lab-srl1
```

(COMMAND, CREATED and PORTS columns trimmed.)

- `docker ps` only lists **running** containers, so srl2 disappears from it. `docker ps -a` lists **all** containers, including stopped ones.
- `Exited (143)`: exit code 143 = 128 + 15, and signal 15 is SIGTERM, the shutdown signal `docker stop` sends. So the container was stopped on purpose, not crashed.

### The link, from srl1's side

```
$ docker exec -it clab-first-lab-srl1 sr_cli -c "show interface brief" | grep -E "ethernet-1/1 |mgmt0"
| ethernet-1/1        | enable   | down     | 25G      |          |          |
| mgmt0               | enable   | up       | 1G       |          |          |
```

srl1's `ethernet-1/1` is admin `enable` but oper `down`: the config is fine, but the link has no partner. The two routers are joined by a veth pair (a virtual cable with one end in each container). When srl2 stopped, its network namespace was destroyed, which deleted its end of the veth pair, and deleting one end of a veth pair deletes the whole pair.

## Fix

### Attempt 1: `docker start` (container back, link still down)

```
$ docker start clab-first-lab-srl2
clab-first-lab-srl2

$ sudo clab inspect -t topology/lab.clab.yml        # table trimmed
│ clab-first-lab-srl1 │ srl │ running │ 172.20.20.2 │
│ clab-first-lab-srl2 │ srl │ running │ 172.20.20.3 │

$ docker exec -it clab-first-lab-srl2 sr_cli -c "show interface brief" | grep -E "ethernet-1/1 |mgmt0"
| ethernet-1/1        | enable   | down     | 25G      |          |          |
| mgmt0               | enable   | up       | 1G       |          |          |

$ docker exec -it clab-first-lab-srl1 sr_cli -c "show interface brief" | grep -E "ethernet-1/1 |mgmt0"
| ethernet-1/1        | enable   | down     | 25G      |          |          |
| mgmt0               | enable   | up       | 1G       |          |          |
```

srl2 is `running` again and `mgmt0` is back (Docker manages the management network), but `ethernet-1/1` is still `down` on both routers. Containerlab, not Docker, created the lab link at deploy time, so `docker start` has no way to recreate it.

### Attempt 2: recreate the link with containerlab (fixed)

```
$ sudo clab tools veth create -a clab-first-lab-srl1:e1-1 -b clab-first-lab-srl2:e1-1
INFO Creating link link="clab-first-lab-srl1:e1-1 -- clab-first-lab-srl2:e1-1"
INFO Created link: clab-first-lab-srl1:e1-1 ▪┄┄▪ clab-first-lab-srl2:e1-1
INFO veth interface successfully created!
```

This recreates just the missing veth pair between the two running containers, the same thing containerlab does for each link at deploy time.

Alternative: `sudo clab redeploy -t topology/lab.clab.yml --cleanup` destroys and redeploys the whole lab from the YAML. It also works, but it's slower and wipes any config changed on the routers.

## Verify

```
$ docker exec -it clab-first-lab-srl1 sr_cli -c "show interface brief" | grep -E "ethernet-1/1 |mgmt0"
| ethernet-1/1        | enable   | up       | 25G      |          |          |
| mgmt0               | enable   | up       | 1G       |          |          |

$ docker exec -it clab-first-lab-srl2 sr_cli -c "show interface brief" | grep -E "ethernet-1/1 |mgmt0"
| ethernet-1/1        | enable   | up       | 25G      |          |          |
| mgmt0               | enable   | up       | 1G       |          |          |
```

`ethernet-1/1` is `enable` / `up` on both routers.

## Takeaways

- A container being `running` doesn't mean its links are up. `clab inspect` only reports container state, so check interfaces too.
- `docker ps` hides stopped containers; use `docker ps -a` when something "disappears".
- Restarting a stopped clab node with `docker start` brings back the node but not its data-plane links. Recreate them with `clab tools veth create`, or `clab redeploy` the lab.

---

*Commands and outputs are from my lab run. Written up from my session output with help from Claude (AI-assisted).*
