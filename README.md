# Primordial AgentStore

I've been building something I'm really excited about: **Primordial AgentStore** — an open marketplace where anyone can publish an AI agent and anyone can run it safely.

The problem that kept bugging me: there's no good way to share AI agents. You can share code, but running someone else's agent means handing over your API keys and trusting arbitrary code on your machine. That's not an ecosystem — it's a gamble.

So I built one where trust isn't required.

**GitHub repo → running agent in under 30 seconds.** You point Primordial at a repo — or browse available agents with `primordial search` — it spins up an isolated sandbox, handles your API keys securely, shows you exactly what permissions the agent needs, and you're chatting with it. That's it.

Every agent runs in its own microVM. Your API keys never touch the agent's code — they're protected by a security layer that keeps them invisible to the agent process. You approve every permission before anything runs. And as you use more agents, your encrypted key vault grows — the first time you add your Anthropic or OpenAI key, every future agent that needs it just works. No re-entering credentials. The more you use it, the faster setup gets.

For developers, the bar to publish an agent is intentionally low. No framework, no SDK. Your agent just reads and writes JSON lines over stdin/stdout. Python, Node, Rust, bash — anything works. Add an `agent.yaml` that declares which API keys and network domains your agent needs, push to GitHub, tag it, and it shows up in the marketplace.

**The use case I'm most excited about: agent delegation.**

Think about [OpenClaw](https://openclaw.ai/) — the open-source AI agent that's taken off (175k+ GitHub stars). OpenClaw can already spin up instances of Claude Code and coordinate them to tackle coding work in parallel. That delegation pattern is incredibly powerful.

Primordial extends that workflow. Instead of only delegating to general-purpose coding agents, imagine OpenClaw pulling in purpose-built specialists from a shared marketplace mid-task. Need to scrape and summarize a competitor's changelog? Delegate to a web research agent. Need to generate a migration plan from your Postgres schema? Spin up a database specialist. Want to draft a PR description from a diff and post it to Slack? Chain a code review agent into a messaging agent. Each sub-agent runs in its own sandbox with its own permissions — fully isolated. And it plugs in the same way — stdin/stdout, just like the Claude Code instances OpenClaw already manages.

Agents that compose other agents. Not one monolith trying to do everything — a network of specialists, each doing one thing well, each sandboxed independently.

**Quick Start:**

```bash
pip install primordial-agentstore
primordial search
```

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
pip install primordial-agentstore
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
