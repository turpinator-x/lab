# Lesson 01 Progress: Containerlab Primer

| Exercise | Status | Files |
|---|---|---|
| 1. Deploy and Explore | ✅ Done | [exercise1-output.md](exercise1-output.md) |
| 2. Modify the Topology (three nodes) | ✅ Done | [three-node.clab.yml](three-node.clab.yml) |
| 3. Generate Documentation | ✅ Done | [topology.png](topology.png), [lab-info.json](lab-info.json) |
| 4. Find Resources | ✅ Done | [resources.md](resources.md) |
| 5. Challenge: Add a Linux Host | ✅ Done | [mixed-topology.clab.yml](mixed-topology.clab.yml), [exercise5-output.md](exercise5-output.md) |
| 6. Break/Fix: Container Stopped | ✅ Done | [exercise6-results.md](exercise6-results.md) |
| 7. Break/Fix: Missing Link | ✅ Done | [broken-topology.clab.yml](broken-topology.clab.yml), [exercise7-results.md](exercise7-results.md) |

Notes on the course README for containerlab 0.79 / SR Linux 24.10.1:

- `show system information` doesn't exist in SR Linux 24.10.1; used `info from state /system information` instead (Exercise 1).
- `containerlab graph -o` means `--offline`, not "output file"; saved the web view as a screenshot instead (Exercise 3).
- `docker start` on a stopped node doesn't restore its lab links; recreated with `clab tools veth create` (Exercise 6).

Each write-up notes where Claude helped (AI-assisted).
