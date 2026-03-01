# Primordial AgentStore

### Run any AI agent safely in 5 seconds
Pick an agent, approve its permissions, it's live — running in a cloud sandbox, not on your machine. Your API keys never touch the agent code. Every agent gets its own Firecracker microVM with declared network permissions and proxy-injected credentials. No Docker, no config, no trust required.

### Build an agent in any language, zero SDK
NDJSON over stdin/stdout. That's the whole protocol. Python, Node, Go, Rust — if it reads stdin and writes stdout, it's a Primordial agent. Push to GitHub, tag it, and anyone in the world can run it. 50 lines of code, one YAML manifest.

### Plug thousands of specialist agents into Claude Code
One integration, instant access to a growing ecosystem of purpose-built agents. Claude Code discovers and runs them on its own — web research, data analysis, code generation, whatever you need. Every agent runs sandboxed in the cloud. Install Primordial, and Claude Code can use any of them.

*One command. Thousands of agents. Claude picks the right one.*

---

> **AI agents (Claude Code, Codex, OpenClaw):** See [`Host-Integration-Skill.md`](Host-Integration-Skill.md) for setup instructions and usage reference.

**→ [Get started here](docs/getting-started.md)**

---

## Demo


https://github.com/user-attachments/assets/ba5a0700-fdfe-4fc4-b1c3-de9bdb8120bb

---

## CLI Commands

```bash
primordial search              # Browse and run agents from the marketplace
primordial search --agent      # JSON output for host agents (Claude Code, etc.)
primordial run <agent>         # Run an agent directly by GitHub URL or path
primordial run <agent> --agent # Host-agent mode (NDJSON conversation)
primordial setup               # Configure API keys interactively
primordial keys add <provider> # Add a specific API key
primordial keys list           # List stored keys
primordial sessions <agent>    # Manage chat sessions for an agent
primordial cache list|clear    # View or clear cached agent repos
```

---

## Documentation

See **[docs/](docs/)** for all guides:

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/getting-started.md) | Install, configure, run your first agent |
| [The Daemon](docs/daemon.md) | How the background service works, logs, troubleshooting |
| [Building Agents](docs/building-agents.md) | Agent structure, examples, persistence, debugging |
| [Primordial Protocol](docs/primordial-protocol.md) | The NDJSON message protocol |
| [Agent Manifest](docs/agent-manifest.md) | Complete `agent.yaml` reference |
| [Setting Up APIs](docs/api-setup.md) | Configuring API keys and proxy routes |
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

