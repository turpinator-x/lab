# Lesson 03 Progress: Routing Basics

| Exercise | Status | File |
|---|---|---|
| 1. Deploy, Configure, and Verify End-to-End | ✅ Done | [exercise1-results.md](exercise1-results.md) |
| 2. Read the Routing Table | ✅ Done | [exercise2-results.md](exercise2-results.md) |
| 3. Break/Fix: Missing Route | ✅ Done | [exercise3-results.md](exercise3-results.md) |
| 4. Break/Fix: Wrong Next-Hop (Black Hole) | ✅ Done | [exercise4-results.md](exercise4-results.md) |
| 5. Break/Fix: Routing Loop | ✅ Done | [exercise5-results.md](exercise5-results.md) |
| 6. Break/Fix: Unreachable Next-Hop (Link Down) | ✅ Done | [exercise6-results.md](exercise6-results.md) |

## Symptom cheat sheet (from exercises 3–6)

| Break | What the ping showed | Meaning |
|---|---|---|
| Missing route (Ex 3) | `Destination Net Unreachable` from the router (forward) / silence (return path) | a router on the path has no route |
| Wrong next hop (Ex 4) | silence, 100% loss | route exists but the next hop never answers ARP (black hole) |
| Routing loop (Ex 5) | ICMP redirects; traceroute alternates between two routers | routers point at each other |
| Link down (Ex 6) | `Destination Net Unreachable` from srl1 | static route withdrawn because its next hop is unreachable |

Each write-up notes where Claude helped (AI-assisted).
