# Primordial AgentStore

**The digital soup from which agents emerge.**

An open marketplace for AI agents. You build an agent, publish it, and anyone can run it — safely inside an isolated Firecracker microVM. There's no opinionated framework, no required language or LLM provider. Your agent just needs to speak the **Primordial Protocol** (NDJSON over stdin/stdout) and declare its permissions in a manifest.

---

## Features

- **Sandbox Isolation** — Every agent runs in a Firecracker microVM (~150ms startup)
- **Language-Agnostic** — Any language that reads stdin and writes stdout works (Python, Node.js, Rust, bash…)
- **Primordial Protocol** — Simple NDJSON message protocol. No framework lock-in.
- **GitHub Agents** — Run agents directly from GitHub URLs with automatic caching
- **Encrypted Key Vault** — API keys encrypted at rest with Fernet (AES-128-CBC + HMAC-SHA256), derived via PBKDF2
- **Agent Delegation** — Agents spawn sub-agents via `--agent-read` pipe mode
- **Persistent State** — Your agent's filesystem survives across sessions, with multi-session support
- **Permission Approval** — Users approve every permission (network domains, filesystem access) before launch

---

## Quick Start

```bash
# Install
pip install primordial

# Configure API keys (interactive)
primordial setup

# Run an agent
primordial run ./my-agent
primordial run https://github.com/user/repo
```

---

## CLI Reference

### `primordial setup`

Interactive setup wizard. Walks through known providers (Anthropic, OpenAI, Brave, Groq, Google, Mistral, DeepSeek, E2B) and stores encrypted API keys.

### `primordial run <agent>`

Run an agent in a sandboxed environment.

```
primordial run ./my-agent                                    # Local directory
primordial run https://github.com/user/repo                  # GitHub URL
primordial run https://github.com/user/repo --ref v1.0.0     # Specific git ref
primordial run ./my-agent --agent-read                       # Primordial Protocol pipe mode
primordial run ./my-agent --yes                              # Skip permission approval
primordial run ./my-agent --refresh                          # Force re-fetch GitHub agent
```

### `primordial keys`

Manage API keys.

```
primordial keys add                               # Interactive picker
primordial keys add anthropic sk-...              # Direct add
primordial keys add anthropic sk-... --key-id prod  # With custom ID
primordial keys list                              # Show all stored keys
primordial keys remove anthropic                  # Remove a key
```

### `primordial search`

Discover agents on GitHub (searches for repos tagged `primordial-agent`).

```
primordial search                                 # Browse available agents
```

### `primordial sessions <agent>`

Manage sessions for an agent.

```
primordial sessions gus                           # List sessions for "gus"
primordial sessions ./my-agent                    # Local agent sessions
```

### `primordial cache`

Manage cached GitHub agent repos.

```
primordial cache list                             # List cached repos
primordial cache clear --all                      # Clear entire cache
primordial cache clear https://github.com/u/repo  # Clear specific entry
```

---

## Building Agents

See **[BUILDING_AGENTS.md](BUILDING_AGENTS.md)** for the complete guide — the protocol, manifest reference, examples, persistence, delegation, security model, and debugging tips.

---

## The Primordial Protocol (Overview)

Every agent is a process that speaks NDJSON over stdin/stdout:

1. Agent starts → prints `{"type": "ready"}`
2. Platform sends `{"type": "message", "content": "...", "message_id": "..."}` on stdin
3. Agent responds with `{"type": "response", "content": "...", "message_id": "...", "done": true}` on stdout
4. On `{"type": "shutdown"}`, agent exits cleanly

Full protocol spec in [BUILDING_AGENTS.md](BUILDING_AGENTS.md).

---

## Security Model

- **Firecracker microVMs** — isolated sandbox per agent (~150ms startup)
- **No network by default** — every domain declared in the manifest with a reason
- **Network enforcement** — domain-level outbound filtering via E2B (SNI/Host header inspection)
- **User approval** — permissions reviewed and approved before launch
- **Encrypted key vault** — Fernet encryption, PBKDF2 key derivation (600k iterations), machine-bound, `0600` file permissions

---

## Project Structure

```
AgentStore/
├── packages/
│   └── client/
│       └── src/agentstore/
│           ├── cli/               # CLI commands (run, setup, keys, cache, search, sessions)
│           ├── sandbox/           # Sandbox manager (E2B/Firecracker)
│           ├── security/          # Key vault, permission handling
│           ├── config.py          # Platform-specific paths
│           ├── github.py          # GitHub URL resolver + caching
│           └── manifest.py        # agent.yaml loader + validation
├── examples/
│   ├── hello-agent/               # Minimal example agent
│   └── steve-agent/               # Full-featured example agent
├── BUILDING_AGENTS.md             # Guide to building agents
└── pyproject.toml
```

---

## Configuration Paths

Uses [`platformdirs`](https://github.com/platformdirs/platformdirs):

| Directory | macOS | Linux |
|-----------|-------|-------|
| Data (keys, state, agents) | `~/Library/Application Support/agentstore/` | `~/.local/share/agentstore/` |
| Cache (GitHub repos) | `~/Library/Caches/agentstore/` | `~/.cache/agentstore/` |

---

## Examples

```bash
primordial run ./examples/hello-agent
primordial run ./examples/steve-agent
```

---

## Development

```bash
pip install -e ./packages/client
pytest
ruff check .
```

Set `E2B_API_KEY` for sandbox runtime ([e2b.dev](https://e2b.dev)).
