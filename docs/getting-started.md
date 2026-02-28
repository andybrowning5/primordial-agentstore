# Getting Started

## Prerequisites

- **Python 3.11+**
- **E2B API key** — sandbox runtime ([e2b.dev](https://e2b.dev), free tier available)

## Quick Start (Claude Code)

```bash
pip install primordial-agentstore
primordial install --claude
```

The install command:
1. Creates an encrypted vault for your API keys (idempotent — safe to run again)
2. Sets up a wrapper script and launchd daemon (auto-starts on login)
3. Installs the Primordial skill into Claude Code
4. Prompts for your E2B API key (required for sandboxes)

After install, restart Claude Code. Then just say "use primordial to research X" and Claude handles the rest.

## Quick Start (OpenClaw / Codex)

```bash
pip install primordial-agentstore
primordial install --openclaw    # or --codex, or --all
```

Same flow — installs the skill for your chosen host agent.

## Adding Agent-Specific API Keys

When Claude or OpenClaw tries to use an agent that needs keys you haven't added yet, it will tell you exactly what to run:

```bash
primordial setup https://github.com/user/web-research-agent
```

This resolves the agent's manifest, checks which keys are missing, and prompts only for those. Example output:

```
Setting up keys for: web-research-agent
  Paste ANTHROPIC API key (required) (Enter to skip): ****
  Paste BRAVE API key (required) (Enter to skip): ****
  Stored anthropic.
  Stored brave.

  anthropic        ✓
  brave            ✓
  e2b              ✓

2 key(s) added.
```

## Interactive Key Management

To manage all keys interactively:

```bash
primordial setup                                 # Interactive picker
primordial keys add                              # Same thing
primordial keys add anthropic sk-ant-...         # Direct add
primordial keys list                             # Show all stored keys
primordial keys remove anthropic                 # Remove a key
```

## Run Your First Agent

```bash
primordial search
```

This searches GitHub for repos tagged `primordial-agent`. Pick one and run it:

```bash
primordial run https://github.com/andybrowning5/web-research-agent
```

You'll see the agent's permissions (network access, API keys, resource limits) and approve before launch.

## Running Agents

```bash
primordial run ./my-agent                        # Local directory
primordial run https://github.com/user/repo      # GitHub URL
primordial run https://github.com/user/repo --ref v1.0.0  # Specific git ref
primordial run ./my-agent --refresh              # Force re-fetch from GitHub
primordial run ./my-agent --agent                # Host-agent mode (NDJSON I/O)
```

## Daemon & Authentication

The Primordial daemon (`primordial serve`) runs on `localhost:19400` and handles all agent lifecycle management. It generates a bearer token at `~/.primordial-daemon-token` (permissions 0600) on each startup.

- `/health` (GET) — unauthenticated, for checking if daemon is running
- All POST endpoints (`/search`, `/run`, `/message`, `/shutdown`) require `Authorization: Bearer <token>`

The skill files handle auth automatically — you don't need to manage tokens manually.

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

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Primordial daemon isn't running" | Run `primordial serve` or reinstall: `primordial install --claude` |
| 401 Unauthorized from daemon | Restart the daemon — token regenerates on startup |
| 428 Missing API keys | Run the `primordial setup <url>` command shown in the error |
| Agent won't start | Check `cat /tmp/primordial-daemon.log` for details |

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
