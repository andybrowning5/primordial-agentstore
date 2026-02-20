# Primordial AgentStore

**The digital soup from which agents emerge.**

An open marketplace for AI agents. You build an agent, publish it, and anyone can run it — safely inside an isolated Firecracker microVM. There's no opinionated framework, no required language or LLM provider. Your agent just needs to speak the **Primordial Protocol** (NDJSON over stdin/stdout) and declare its permissions in a manifest.

---

## Features

- **Sandbox Isolation** — Every agent runs in a Firecracker microVM (~150ms startup)
- **Language-Agnostic** — Any language that reads stdin and writes stdout works
- **Primordial Protocol** — Simple NDJSON message protocol. No framework lock-in.
- **GitHub Agents** — Run agents directly from GitHub URLs with automatic caching
- **Encrypted Key Vault** — API keys encrypted at rest with Fernet (AES-128-CBC + HMAC-SHA256)
- **Custom Providers** — Use any API with configurable auth styles
- **Agent Delegation** — Agents spawn sub-agents via pipe mode
- **Persistent State** — Agent filesystem survives across sessions
- **Permission Approval** — Users approve every permission before launch

---

## Quick Start

```bash
pip install primordial
primordial search              # Browse agents, pick one, and run it
```

The CLI will prompt you for any API keys the agent needs on first run. To manually add or update keys later:

```bash
primordial setup               # Interactive setup for all providers
primordial keys add anthropic sk-ant-...  # Add a specific key
```

---

## Documentation

See **[docs/](docs/)** for all guides:

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/getting-started.md) | Install, configure, run your first agent |
| [Building Agents](docs/building-agents.md) | Agent structure, examples, persistence, debugging |
| [Primordial Protocol](docs/primordial-protocol.md) | The NDJSON message protocol |
| [Agent Manifest](docs/agent-manifest.md) | Complete `agent.yaml` reference |
| [Custom Providers](docs/custom-providers.md) | Using non-built-in APIs |
| [Agent Delegation](docs/agent-delegation.md) | Spawning sub-agents |
| [Publishing Agents](docs/publishing.md) | Share your agent with others |
| [Security Architecture](docs/security.md) | Threat model, sandbox, key vault, proxy |

---

## Project Structure

```
AgentStore/
├── packages/
│   └── client/
│       └── src/primordial/
│           ├── cli/               # CLI commands
│           ├── sandbox/           # Sandbox manager + reverse proxy
│           ├── security/          # Key vault, permissions
│           ├── config.py          # Platform-specific paths
│           ├── github.py          # GitHub URL resolver + caching
│           └── manifest.py        # agent.yaml loader + validation
├── docs/                          # Documentation
└── CHANGELOG.md                   # Release notes
```

---

## Development

```bash
pip install -e ./packages/client
pytest
ruff check .
```

Set `E2B_API_KEY` for sandbox runtime ([e2b.dev](https://e2b.dev)).
