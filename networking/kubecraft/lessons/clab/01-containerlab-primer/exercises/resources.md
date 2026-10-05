# Exercise 4: Containerlab Resources

## 1. SR Linux documentation

- SR Linux kind page: https://containerlab.dev/manual/kinds/srl/
- General startup-config docs (all kinds): https://containerlab.dev/manual/nodes/#startup-config

### Startup configuration options

The `startup-config` property on a node can point to a file on the host, an embedded multiline config in the topology file, or a URL (https, http, S3, ftp, sftp or scp). For SR Linux there are three ways a node can come up:

- **Default (no `startup-config`):** containerlab applies its own default config, which enables the interfaces listed in `links:`, plus LLDP and the management APIs (gNMI and JSON-RPC). This is why `ethernet-1/1` was enabled and up in Exercise 1 while all the other ethernet ports were disabled.
- **CLI file (partial config):** the node boots with the default config, then applies the CLI commands from the file on top of it.
- **JSON file (full config):** a complete config in SR Linux's own saved format, which replaces the default.

### License

A license file is set with the `license:` property on the node in the topology file. It's optional for SR Linux: the free image runs unlicensed, with limits (datapath capped at 1000 packets per second and an automatic restart once a week). That's fine for lab use.

## 2. Community lab

**[michelredondo/nokia-ai-fabric-eda](https://github.com/michelredondo/nokia-ai-fabric-eda)** (topic `clab-topo`)

An AI Fabric reference topology built with Nokia EDA, SR Linux and Containerlab on a Kubernetes cluster. I'd like to try it because it combines Kubernetes and AI networking, which matches the Platform/Cloud Engineer roles I'm aiming for.

## 3. Discord community

Invite link: https://discord.gg/vAyddtaEV9

I chose not to join the Discord at this time.

---

*Research and choices are mine. Reformatted and corrected with help from Claude (AI-assisted).*
