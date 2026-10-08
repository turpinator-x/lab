# lab

Hands-on coursework from the KubeCraft Career Accelerator (KCCA): Bash scripting, Docker, Kubernetes, and container networking. Started August 2026. Each folder is the work from one lesson or exercise set.

My homelab build log, which ties this work together, is in [turpinator-x/homelab](https://github.com/turpinator-x/homelab).

## Bash scripting

`bash/` holds scripts from the Bash scripting module, one folder per topic:

| Folder | Topic |
|---|---|
| `intro/` | first scripts (`hello`, `sysinfo`) |
| `variables/` | variables and script arguments |
| `parameter-expansion/` | default values, passing values, log levels |
| `conditionals/` | `if` / `case`: file checks, service checks, dependency checks |
| `loops/` | `for` / `while` loops and processing input |
| `functions-arrays/` | functions, arrays, a task runner |

## Docker

Small apps built into container images, from the Containers module:

| Folder | What it is |
|---|---|
| `greeter/`, `myapp/` | first images: a greeting script in a container |
| `generator/`, `status/` | generate a static HTML status page with system info |
| `health/` | nginx image with a `HEALTHCHECK` |
| `backup/` | a backup script packaged as an image |
| `joke-dashboard/` | Docker Compose project: an updater container fetches dad jokes into a page served by nginx, with a one-shot init container fixing volume permissions |
| `Dockerfile` | a top-level Ubuntu 24.04 image that runs a `backup` script |

## Kubernetes

Manifests from the Kubernetes Fundamentals course, run on a local Rancher Desktop cluster:

| Folder | What it covers |
|---|---|
| `deployments/` | Pods and Deployments: nginx, rolling vs. recreate updates, a broken deployment to debug |
| `mealie/` | a full app (Mealie recipe manager): Namespace, Deployment, Service, and a PersistentVolumeClaim so data survives the pod |
| `helm/` | Helm values for installing Homarr |
| `monitoring/` | kube-prometheus-stack values (Prometheus + Grafana) and a LoadBalancer Service for Grafana |

## Networking (containerlab)

`networking/kubecraft/` is the course repo for the Networking module, with my exercise work in `lessons/clab/`. Every lesson builds a virtual network of Nokia SR Linux routers in containerlab, then breaks and fixes it. Each lesson's `exercises/PROGRESS.md` lists what I did and links to the write-ups.

| Lesson | Topic |
|---|---|
| 00 | Docker networking: network namespaces, bridges, veth pairs, NAT |
| 01 | containerlab primer: deploying and changing topologies |
| 02 | IP fundamentals: addressing, loopbacks, subnet and gateway faults |
| 03 | routing basics: static routes, black holes, routing loops |
| 04 | dynamic routing with eBGP: export policies, path selection, failover |
| 05 | spine-leaf BGP fabric: ECMP, spine failure, route leaks |

## Dev containers

`devpod-test/` is a DevPod workspace from the Dev Containers course: a `devcontainer.json` with the Azure CLI, GitHub CLI, and 1Password CLI features, plus a dotfiles `setup` script.
