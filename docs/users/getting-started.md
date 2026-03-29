# Getting Started

## Prerequisites

- Python 3.11+
- An [E2B API key](https://e2b.dev/dashboard) (free tier available)

## Install

```bash
pip install primordial-agentstore
```

## Set Up API Keys

```bash
primordial setup
```

This walks you through adding your API keys (E2B, Anthropic, etc.) to the encrypted local vault. Keys are never stored in plaintext.

## Using the CLI

### Search for agents

```bash
primordial search                        # Browse all agents
primordial search "web research"         # Semantic search by capability
```

### Run an agent

```bash
primordial run https://github.com/owner/agent-name
primordial run https://github.com/owner/agent-name --workspace .
```

Use `--workspace <path>` to give the agent read/write access to a local git repo (see [Workspace Isolation](workspace-isolation.md)).

---

## Using with Claude Code, Cursor, or Windsurf

Primordial integrates with MCP-compatible AI coding hosts via a built-in MCP server. One command registers it everywhere:

```bash
primordial mcp install
```

This writes the MCP server entry to the config files for any detected hosts:

| Host | Config File |
|------|-------------|
| Claude Code | `~/.claude.json` |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Cursor | `~/.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| OpenClaw | `~/.openclaw/openclaw.json` |
| Codex CLI / Desktop | `~/.codex/config.toml` |

To target a specific host:

```bash
primordial mcp install --host claude
primordial mcp install --host claude-desktop
primordial mcp install --host cursor
primordial mcp install --host windsurf
primordial mcp install --host openclaw
primordial mcp install --host codex
```

After install, **restart your IDE**. Primordial will appear as an MCP server with tools for searching and running agents.

### Usage

Just ask naturally: *"use primordial to research X"* or *"find an agent for data analysis"* — your host searches the marketplace, picks an agent, spawns it, and relays the results. The agent runs sandboxed in the cloud.

If an agent needs API keys you haven't added yet, you'll be told exactly what to run:

```bash
primordial keys add anthropic
```

### Applying Agent Workspace Changes

When an agent modifies files, the changes are captured as a git patch. After a session ends:

```bash
primordial apply <session_id>   # preview + apply changes
primordial apply --last         # apply the most recent session's changes
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| MCP server not appearing in host | Re-run `primordial mcp install`, restart your IDE |
| Missing API keys | Run `primordial setup` or `primordial keys add <provider>` |
| Agent won't start | Check that your E2B key is set: `primordial keys list` |
| Unknown provider warning | Run agent and approve the unknown API provider when prompted |

## Next Steps

- [MCP Server](background-service.md) — how the MCP integration works
- [Workspace isolation](workspace-isolation.md) — how agents read and modify your code safely
- [Build your own agent](../developers/building-agents.md)
- [Understand the protocol](../developers/protocol.md)
- [Publish an agent](../developers/publishing.md)
