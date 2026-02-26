# Getting Started

## Prerequisites

- **Python 3.11+**
- **E2B API key** — sandbox runtime ([e2b.dev](https://e2b.dev))
- At least one LLM provider API key (Anthropic, OpenAI, etc.)

## Install

```bash
pip install primordial-agentstore
```

## Run Your First Agent

```bash
primordial search
```

This searches GitHub for repos tagged `primordial-agent`. Pick one and run it. The CLI will prompt you for any API keys the agent needs on first run.

You can also run an agent directly by URL:

```bash
primordial run https://github.com/andybrowning5/web-research-agent
```

You'll see the agent's permissions (network access, API keys, resource limits) and approve before launch.

## Managing API Keys

To add or update keys at any time:

```bash
primordial setup                                 # Interactive setup for all providers
primordial keys add                              # Interactive picker
primordial keys add anthropic sk-ant-...         # Direct add
primordial keys add anthropic sk-ant-... --key-id prod  # With custom ID
primordial keys list                             # Show all stored keys
primordial keys remove anthropic                 # Remove a key
```

## Running Agents

```bash
primordial run ./my-agent                        # Local directory
primordial run https://github.com/user/repo      # GitHub URL
primordial run https://github.com/user/repo --ref v1.0.0  # Specific git ref
primordial run ./my-agent --refresh              # Force re-fetch from GitHub
primordial run ./my-agent --agent                # Host-agent mode (NDJSON I/O)
```

## Host-Agent Mode

The `--agent` flag lets host agents like Claude Code or OpenClaw use Primordial interactively to spawn and converse with specialized sub-agents.

```bash
# Search returns JSON
primordial search "web research" --agent

# Run goes through interactive setup, then switches to NDJSON
primordial run <url> --agent
```

With `--agent`:
- **Search** outputs a JSON array of agents (no Rich UI)
- **Run** shows the session picker and permissions approval on stdout/stdin — the host agent participates just like a human
- After approval, the conversation uses NDJSON on stdin/stdout
- Missing API keys produce an error with `primordial keys add <provider>` instructions instead of prompting for the key value

## Sessions

Agents persist state between runs. When you run an agent, you can start fresh or resume a previous session.

```bash
primordial sessions my-agent                     # List sessions
primordial sessions ./my-agent                   # Local agent sessions
```

## Cache Management

GitHub agents are cloned and cached locally (1-hour staleness check).

```bash
primordial cache list                            # List cached repos
primordial cache clear --all                     # Clear entire cache
primordial cache clear https://github.com/u/repo # Clear specific entry
```

## Configuration Paths

Uses [`platformdirs`](https://github.com/platformdirs/platformdirs):

| Directory | macOS | Linux |
|-----------|-------|-------|
| Data (keys, state) | `~/Library/Application Support/primordial/` | `~/.local/share/primordial/` |
| Cache (GitHub repos) | `~/Library/Caches/primordial/` | `~/.cache/primordial/` |

## Next Steps

- [Build your own agent](building-agents.md)
- [Understand the protocol](primordial-protocol.md)
- [Publish an agent](publishing.md)
