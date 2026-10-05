# Lesson 00 Progress: Docker Networking

| Exercise | Status |
|---|---|
| 1. Inspect Docker's network plumbing | ✅ Done |
| 2. Build a container network from scratch (netns, bridge, veth) | ✅ Done |
| 3. Enable internet access (NAT) | ✅ Done |
| 4. Break/Fix: bridge down | ✅ Done |
| 5. Break/Fix: missing masquerade | ✅ Done |
| Bonus: Docker Compose networking | ✅ Done |

Automated tests: 20/20 passed (2026-10-03).

Diagrams of each setup, built from my own command output (drawn with Claude, AI-assisted):

- [01-docker-default-bridge.svg](diagrams/01-docker-default-bridge.svg): c1 + c2 on `docker0`
- [02-netns-br-study.svg](diagrams/02-netns-br-study.svg): red + blue namespaces on `br-study` with NAT
- [03-compose-network.svg](diagrams/03-compose-network.svg): Compose project bridge with service-name DNS
