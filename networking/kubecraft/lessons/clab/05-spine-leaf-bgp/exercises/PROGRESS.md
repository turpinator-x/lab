# Lesson 05 Progress: Spine-Leaf BGP

| Exercise | Status | File |
|---|---|---|
| 1. Deploy and Configure the Fabric | ✅ Done | [exercise1-results.md](exercise1-results.md) |
| 2. Read the Fabric Routing Table (ECMP) | ✅ Done | [exercise2-results.md](exercise2-results.md) |
| 3. Break/Fix: Spine Failure | ✅ Done (0 packets lost; ping output not saved) | [exercise3-results.md](exercise3-results.md) |
| 4. Challenge: Route Leak / Hijack | ✅ Done (hijack didn't take effect: unresolvable blackhole next hop; /31 leak observed instead) | [exercise4-results.md](exercise4-results.md) |

Diagram: [diagrams/01-spine-leaf-topology.svg](diagrams/01-spine-leaf-topology.svg)

## Key ideas

- 3-stage folded Clos: every leaf connects to every spine; any two hosts are always 3 routers apart.
- RFC 7938 eBGP: spines share AS 65000, each leaf has its own ASN; gives ECMP and AS-path loop prevention.
- `maximum-paths 2` enables ECMP; losing a spine removes one next hop with no reconvergence.
- `host-subnets` prefix-set keeps /31 fabric links out of BGP; removing that filter leaks them.
- Longest prefix match: a more-specific prefix (/25) beats the real /24, which is how hijacks work.

Each write-up notes where Claude helped (AI-assisted).
