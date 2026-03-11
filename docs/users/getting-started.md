# Getting Started

## Prerequisites

- Python 3.11+
- An [E2B API key](https://e2b.dev/dashboard) (free tier available)

## Install

```bash
pip install primordial-agentstore
```

## Using the CLI

### Search for agents

```bash
primordial search
```

Browse available agents on the marketplace. Pick one to run.

---

## Using with Claude Code, OpenClaw, or Codex

These host agents talk to Primordial through a background service (daemon) running on your machine. The install command sets everything up — the skill file, the daemon, and auto-start on login.

```bash
primordial install --claude      # Claude Code
primordial install --openclaw    # OpenClaw
primordial install --codex       # Codex
primordial install --all         # All of the above
```

After install, restart your host agent. The daemon starts automatically and listens on `localhost:19400`.

To verify it's running:

```bash
curl -s http://localhost:19400/health
```

If you're on **Linux** (no launchd), you'll need to start the daemon manually:

```bash
primordial serve
```

See [Background Service](background-service.md) for logs, restart commands, and troubleshooting.

### Usage

Just say things like "use primordial to research X" or "find an agent for data analysis" — your host agent searches the marketplace, picks an agent, spawns it, and relays the results.

If an agent needs API keys you haven't added yet, you'll be told exactly what to run:

```bash
primordial setup https://github.com/user/web-research-agent
```

> **Note:** Codex's sandbox may block localhost connections. You may need `--dangerously-bypass-approvals-and-sandbox` or sandbox network configuration.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Service not running | Run `primordial serve` or re-run `primordial install` |
| Missing API keys | Run `primordial setup` or `primordial setup <agent-url>` |
| Agent won't start | Check `/tmp/primordial-daemon.log` |

## Next Steps

- [Workspace isolation](workspace-isolation.md) — how agents read and modify your code safely
- [Build your own agent](../developers/building-agents.md)
- [Understand the protocol](../developers/protocol.md)
- [Publish an agent](../developers/publishing.md)
