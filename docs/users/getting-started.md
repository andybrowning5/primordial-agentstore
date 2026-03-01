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

## Using with Claude Code

```bash
primordial install --claude
```

This installs a skill file so Claude Code knows how to use Primordial. After install, restart Claude Code.

Then just say things like "use primordial to research X" or "find an agent for data analysis" — Claude searches the marketplace, picks an agent, spawns it, and relays the results.

If an agent needs API keys you haven't added yet, Claude will tell you exactly what to run. For example:

```
primordial setup https://github.com/user/web-research-agent
```

### Using with OpenClaw

```bash
primordial install --openclaw
```

Same idea — OpenClaw can delegate tasks to specialist agents mid-workflow via the Primordial background service.

### Using with Codex

```bash
primordial install --codex
```

Note: Codex's sandbox may block localhost connections. You may need `--dangerously-bypass-approvals-and-sandbox` or sandbox network configuration.

### Install for all hosts

```bash
primordial install --all
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Service not running | Run `primordial serve` or re-run `primordial install` |
| Missing API keys | Run `primordial setup` or `primordial setup <agent-url>` |
| Agent won't start | Check `/tmp/primordial-daemon.log` |

## Next Steps

- [Build your own agent](../developers/building-agents.md)
- [Understand the protocol](../developers/protocol.md)
- [Publish an agent](../developers/publishing.md)
