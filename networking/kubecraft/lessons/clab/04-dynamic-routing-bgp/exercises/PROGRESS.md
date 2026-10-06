# Lesson 04 Progress: Dynamic Routing with BGP

| Exercise | Status | File |
|---|---|---|
| 1. Deploy and Configure eBGP | ✅ Done | [exercise1-results.md](exercise1-results.md) |
| 2. Enable the Direct Link and Observe Path Selection | ✅ Done | [exercise2-results.md](exercise2-results.md) |
| 3. Break/Fix: Missing Export Policy | ✅ Done | [exercise3-results.md](exercise3-results.md) |
| 4. Break/Fix: Link Failure with Automatic Reroute | ✅ Done (exact loss/recovery moment not captured) | [exercise4-results.md](exercise4-results.md) |
| 5. Break/Fix: Wrong ASN | ✅ Done | [exercise5-results.md](exercise5-results.md) |
| 6. Break/Fix: Stale Static Route Masks BGP | ✅ Done | [exercise6-results.md](exercise6-results.md) |

Diagram: [diagrams/01-bgp-hub-spoke-path.svg](diagrams/01-bgp-hub-spoke-path.svg)

## BGP troubleshooting cheat sheet (from exercises 3–6)

| Break | What it looked like | Where to look |
|---|---|---|
| Missing export policy (Ex 3) | sessions Established, `Tx 0`; others can't reach that router's networks | `[Rx/Active/Tx]` in `show ... bgp neighbor` |
| Link down (Ex 4) | session to that neighbor drops to `active`; traffic reroutes (TTL changes) | neighbor state + traceroute |
| Wrong peer ASN (Ex 5) | session stuck in `active` on both sides | `Peer-AS` column vs the neighbor's real ASN |
| Stale static route (Ex 6) | route type `static` (Pref 5) instead of `bgp` (Pref 170); BGP path valid but unused | route table type + `bgp routes ipv4 summary` |

Note: because of the srl2–srl3 link added in Exercise 2, exercises 5 and 6 rerouted around the problem instead of failing as the course README expects.

Each write-up notes where Claude helped (AI-assisted).
