# Exercise 2 Results: Read the Routing Table

Goal: read the routing tables on all three routers and trace a packet hop by hop, in both directions.

## Routing tables

Command (per router):

```
docker exec clab-routing-basics-<router> sr_cli -c "show network-instance default route-table ipv4-unicast summary"
```

(Columns trimmed for readability. The `/32` `host` rows are each router's own IPs and broadcast addresses.)

### srl1 (hub)

```
| Prefix        | Route Type | Pref | Next-hop (Type)              | Next-hop Interface |
|---------------|------------|------|------------------------------|--------------------|
| 10.1.1.0/24   | local      | 0    | 10.1.1.1 (direct)            | ethernet-1/1.0     |
| 10.1.2.0/24   | local      | 0    | 10.1.2.1 (direct)            | ethernet-1/2.0     |
| 10.1.3.0/24   | local      | 0    | 10.1.3.1 (direct)            | ethernet-1/3.0     |
| 10.1.4.0/24   | static     | 5    | 10.1.2.0/24 (indirect/local) | ethernet-1/2.0     |
| 10.1.5.0/24   | static     | 5    | 10.1.3.0/24 (indirect/local) | ethernet-1/3.0     |
IPv4 routes total : 11   (including 6 host /32 rows)
```

### srl2 (spoke)

```
| Prefix        | Route Type | Pref | Next-hop (Type)              | Next-hop Interface |
|---------------|------------|------|------------------------------|--------------------|
| 10.1.1.0/24   | static     | 5    | 10.1.2.0/24 (indirect/local) | ethernet-1/1.0     |
| 10.1.2.0/24   | local      | 0    | 10.1.2.2 (direct)            | ethernet-1/1.0     |
| 10.1.2.2/32   | host       | 0    | None (extract)               | None               |
| 10.1.2.255/32 | host       | 0    | None (broadcast)             |                    |
| 10.1.3.0/24   | static     | 5    | 10.1.2.0/24 (indirect/local) | ethernet-1/1.0     |
| 10.1.4.0/24   | local      | 0    | 10.1.4.1 (direct)            | ethernet-1/2.0     |
| 10.1.4.1/32   | host       | 0    | None (extract)               | None               |
| 10.1.4.255/32 | host       | 0    | None (broadcast)             |                    |
| 10.1.5.0/24   | static     | 5    | 10.1.2.0/24 (indirect/local) | ethernet-1/1.0     |
IPv4 routes total : 9
```

### srl3 (spoke)

```
| Prefix        | Route Type | Pref | Next-hop (Type)              | Next-hop Interface |
|---------------|------------|------|------------------------------|--------------------|
| 10.1.1.0/24   | static     | 5    | 10.1.3.0/24 (indirect/local) | ethernet-1/1.0     |
| 10.1.2.0/24   | static     | 5    | 10.1.3.0/24 (indirect/local) | ethernet-1/1.0     |
| 10.1.3.0/24   | local      | 0    | 10.1.3.2 (direct)            | ethernet-1/1.0     |
| 10.1.3.2/32   | host       | 0    | None (extract)               | None               |
| 10.1.3.255/32 | host       | 0    | None (broadcast)             |                    |
| 10.1.4.0/24   | static     | 5    | 10.1.3.0/24 (indirect/local) | ethernet-1/1.0     |
| 10.1.5.0/24   | local      | 0    | 10.1.5.1 (direct)            | ethernet-1/2.0     |
| 10.1.5.1/32   | host       | 0    | None (extract)               | None               |
| 10.1.5.255/32 | host       | 0    | None (broadcast)             |                    |
IPv4 routes total : 9
```

## Local vs static routes per router

Static next hops come from each router's `ansible/host_vars/<router>.yml`. The table's `(indirect/local)` entry shows the connected subnet SR Linux uses to reach that next hop.

| Router | Local (directly connected) | Static (next hop) |
|---|---|---|
| **srl1** | 10.1.1.0/24 on e1-1 (host1) · 10.1.2.0/24 on e1-2 (srl2) · 10.1.3.0/24 on e1-3 (srl3) | 10.1.4.0/24 → 10.1.2.2 (srl2) · 10.1.5.0/24 → 10.1.3.2 (srl3) |
| **srl2** | 10.1.2.0/24 on e1-1 (srl1) · 10.1.4.0/24 on e1-2 (host2) | 10.1.1.0/24, 10.1.3.0/24, 10.1.5.0/24 → 10.1.2.1 (srl1) |
| **srl3** | 10.1.3.0/24 on e1-1 (srl1) · 10.1.5.0/24 on e1-2 (host3) | 10.1.1.0/24, 10.1.2.0/24, 10.1.4.0/24 → 10.1.3.1 (srl1) |

This is the hub-and-spoke pattern: each spoke only knows its own two networks and sends everything else to the hub. The hub (srl1) knows where every spoke subnet lives.

## Hop-by-hop trace

Method, applied at every hop:

1. What's the destination IP? (It doesn't change along the way.)
2. Which route in *this* device's table matches it?
3. Does that route deliver directly (local) or send to a next hop (static)? Move to the next hop and repeat. Stop when a router has a local route for the destination.

### Forward path: host2 (10.1.4.2) → host3 (10.1.5.2)

| Hop | Device | Matching route | Action |
|---|---|---|---|
| 1 | host2 | `default via 10.1.4.1` (10.1.5.2 isn't in 10.1.4.0/24) | send to its gateway, srl2 |
| 2 | srl2 | `10.1.5.0/24` static → 10.1.2.1 | send to srl1 out e1-1 |
| 3 | srl1 | `10.1.5.0/24` static → 10.1.3.2 | send to srl3 out e1-3 |
| 4 | srl3 | `10.1.5.0/24` local on e1-2 | deliver directly to host3 |

### Return path: host3 (10.1.5.2) → host2 (10.1.4.2)

The reply is a new packet with destination 10.1.4.2, so every router looks it up again:

| Hop | Device | Matching route | Action |
|---|---|---|---|
| 1 | host3 | `default via 10.1.5.1` | send to its gateway, srl3 |
| 2 | srl3 | `10.1.4.0/24` static → 10.1.3.1 | send to srl1 out e1-1 |
| 3 | srl1 | `10.1.4.0/24` static → 10.1.2.2 | send to srl2 out e1-2 |
| 4 | srl2 | `10.1.4.0/24` local on e1-2 | deliver directly to host2 |

Every route the ping needs exists in both directions, which is why host2 → host3 works. It also matches the ping output from Exercise 1: the reply crossed three routers (srl3, srl1, srl2), so its TTL dropped from 64 to **61**.

## Takeaways

- A spoke router doesn't need to know the whole network; it just needs a route to the hub for everything that isn't local.
- A ping needs routes in both directions. The forward and return paths are looked up separately, so a missing route on either one breaks the ping.

---

*Routing tables are from my lab run (2026-10-05). I identified the local and static routes; the next-hop corrections, the tracing method and the hop-by-hop traces were written with help from Claude (AI-assisted).*
