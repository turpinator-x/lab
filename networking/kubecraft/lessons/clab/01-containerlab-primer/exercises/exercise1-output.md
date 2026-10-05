# Exercise 1 Output: Deploy and Explore

Lab: `topology/lab.clab.yml` (two SR Linux nodes, `srl1:e1-1` ↔ `srl2:e1-1`)

## `containerlab inspect`

```
$ sudo clab inspect
╭─────────────────────┬───────────────────────────────┬─────────┬───────────────────╮
│         Name        │           Kind/Image          │  State  │   IPv4/6 Address  │
├─────────────────────┼───────────────────────────────┼─────────┼───────────────────┤
│ clab-first-lab-srl1 │ srl                           │ running │ 172.20.20.2       │
│                     │ ghcr.io/nokia/srlinux:24.10.1 │         │ 3fff:172:20:20::2 │
├─────────────────────┼───────────────────────────────┼─────────┼───────────────────┤
│ clab-first-lab-srl2 │ srl                           │ running │ 172.20.20.3       │
│                     │ ghcr.io/nokia/srlinux:24.10.1 │         │ 3fff:172:20:20::3 │
╰─────────────────────┴───────────────────────────────┴─────────┴───────────────────╯
```

## `show version` (srl2)

```
$ docker exec -it clab-first-lab-srl2 sr_cli
A:srl2# show version
Hostname             : srl2
Chassis Type         : 7220 IXR-D2L
Part Number          : Sim Part No.
Serial Number        : Sim Serial No.
System HW MAC Address: 1A:81:01:FF:00:00
OS                   : SR Linux
Software Version     : v24.10.1
Build Number         : 492-gf8858c5836
Architecture         : x86_64
Last Booted          : 2026-10-05T15:03:47.503Z
Total Memory         : 63991648 kB
Free Memory          : 20190078 kB
```

SR Linux version: **v24.10.1** (build `492-gf8858c5836`). srl1 reports the same version.

## `show interface brief` (srl2)

```
A:srl2# show interface brief
+---------------+-------------+------------+-------+
|     Port      | Admin State | Oper State | Speed |
+===============+=============+============+=======+
| ethernet-1/1  | enable      | up         | 25G   |
| ethernet-1/2  | disable     | down       | 25G   |
| ...           | ...         | ...        | ...   |
| ethernet-1/57 | disable     | down       | 10G   |
| ethernet-1/58 | disable     | down       | 10G   |
| mgmt0         | enable      | up         | 1G    |
+---------------+-------------+------------+-------+
```

(Trimmed: `ethernet-1/2` through `ethernet-1/56` are all `disable` / `down`. Empty Type and Description columns removed.) srl1 shows the same pattern.

## Why is `ethernet-1/1` up while the other ethernet ports are down?

The YAML file connects srl1 and srl2 with port ethernet-1/1. No cable is connected to the other ports and their Admin state is disabled. `mgmt0` is also up because containerlab automatically connects every node's `mgmt0` to the management network (`clab`, `172.20.20.0/24`); it doesn't come from `links:`.

## `show system information`

`show system information` from the exercise README doesn't exist in SR Linux v24.10.1 (`Parsing error: Unknown token 'information'`). The same data is available from the state tree:

```
A:srl2# info from state /system information
    system {
        information {
            description "SRLinux-v24.10.1-492-gf8858c5836 7220 IXR-D2L Copyright (c) 2000-2020 Nokia. Kernel 7.2.5-3-omarchy #1 SMP PREEMPT_DYNAMIC Mon, 14 Sep 2026 19:55:01 +0000"
            current-datetime "2026-10-05T15:22:41.862Z (now)"
            last-booted "2026-10-05T15:03:50.454Z (18 minutes ago)"
            version v24.10.1-492-gf8858c5836
        }
    }
```

Shows the image version used, current datetime, last-booted, and version number.

The kernel in the description (`7.2.5-3-omarchy`) is my laptop's kernel: containers share the host's kernel instead of running their own like a VM.

---

*Commands and outputs are from my lab run. Formatted with help from Claude (AI-assisted).*
