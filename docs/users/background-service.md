# MCP Server

Primordial integrates with AI coding hosts (Claude Code, Cursor, Windsurf, OpenClaw, Codex) via a Model Context Protocol (MCP) server. The host spawns the MCP server as a subprocess and communicates via stdio — no background daemon, no ports to manage.

## What it does

- Exposes 7 tools to the host LLM: `search_agents`, `list_sessions`, `run_agent`, `approve_agent`, `send_message`, `get_session_status`, `stop_agent`
- Starts and stops agent sandboxes on demand
- Handles API key injection so agents never see your real keys
- Validates agent URLs for safety before fetching manifests (HTTPS-only, no private IPs)
- Presents an approval prompt for agents using unrecognized API providers

## Installing

```bash
primordial mcp install
```

This writes the MCP server entry to any detected host config files. Safe to run multiple times (idempotent).

To target a specific host:

```bash
primordial mcp install --host claude          # ~/.claude.json
primordial mcp install --host claude-desktop  # ~/Library/Application Support/Claude/...
primordial mcp install --host cursor          # ~/.cursor/mcp.json
primordial mcp install --host windsurf        # ~/.codeium/windsurf/mcp_config.json
primordial mcp install --host openclaw        # ~/.openclaw/openclaw.json
primordial mcp install --host codex           # ~/.codex/config.toml (CLI + Desktop)
```

Restart your IDE after installing.

## Running manually

In stdio mode (default, used by IDE integrations):

```bash
primordial mcp serve
```

In HTTP mode (for direct connections or debugging):

```bash
primordial mcp serve --http   # binds to localhost:19401
```

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `search_agents(query)` | Search the marketplace by keyword or capability |
| `list_sessions(url)` | List previous sessions for an agent (for resuming state) |
| `run_agent(url, message)` | Spawn an agent and send it an initial task |
| `approve_agent(pending_id, approved)` | Approve or reject an agent needing user confirmation |
| `send_message(session_id, message)` | Send a follow-up message to a running agent |
| `get_session_status(session_id)` | Check if a session is still alive |
| `stop_agent(session_id)` | Stop the agent and get a patch of any file changes |

## Security: Provider Approval

When an agent declares an API provider that isn't in Primordial's known-provider registry, the MCP server pauses and returns a `requires_approval` response. The host LLM presents the findings to you:

- Which provider and domain the agent wants to reach
- A spoofing warning if the domain resembles a known provider's API (e.g. `api.anthropic.com.evil.com`)

You can approve or reject. Approvals expire after 5 minutes. Hard rejections (non-HTTPS URLs, private IP ranges) are never offered for approval — they're blocked outright.

## Session Resume

Primordial agents persist their workspace state (memory, files, conversation history) between sessions. To resume a previous session:

1. Ask the host to call `list_sessions(url)` to see available sessions for that agent
2. Pass the `session_name` to `run_agent` to restore prior state

The agent picks up where it left off.

## Workspace Patches

When `stop_agent` is called, Primordial captures a unified diff of any files the agent modified. After the session ends:

```bash
primordial apply <session_id>   # preview the diff and apply changes
primordial apply --last         # apply the most recent session's changes
primordial apply <session_id> --dry-run  # preview only, no changes written
```

## Upgrading

```bash
pip install --upgrade primordial-agentstore
```

After upgrading, restart your IDE so the new version of the MCP server is picked up. No daemon restart needed.
