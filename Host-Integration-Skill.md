# Primordial AgentStore — Host Agent Integration

Host-specific skill files are available for each supported platform:

| Host | Skill File | Install Command |
|------|-----------|-----------------|
| **OpenClaw** | `skills/primordial/SKILL-openclaw.md` | `primordial install --openclaw` |
| **Claude Code** | `skills/primordial/SKILL-claude.md` | `primordial install --claude` |
| **Codex CLI** | `skills/primordial/SKILL-codex.md` | `primordial install --codex` |

## Quick Setup

```bash
pip install primordial-agentstore
primordial install --all    # installs for all hosts
primordial setup            # add API keys (e2b + model provider)
```

## Architecture

- **OpenClaw**: Uses HTTP daemon on `localhost:19400` — no process management needed
- **Claude Code**: Uses HTTP daemon on `localhost:19400` with bearer token auth
- **Codex CLI**: Uses `primordial run --agent --auto-approve` for non-interactive operation
