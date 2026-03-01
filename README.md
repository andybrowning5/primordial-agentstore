# Primordial AgentStore

An open-source marketplace for AI agents. Anyone can publish an agent, anyone can run it safely — no trust required. Agents run in cloud-sandboxed Firecracker microVMs with proxy-injected API keys, declared permissions, and full network isolation. You never run someone else's code on your machine, and your credentials never touch theirs.

**→ [Get started](docs/users/getting-started.md)**

#### Run any AI agent safely in 5 seconds
Pick an agent, approve its permissions, it's live — running in a cloud sandbox, not on your machine. Your API keys never touch the agent code. No Docker, no config, no trust required.

#### Build an agent in any language, zero SDK
NDJSON over stdin/stdout. That's the whole protocol. Python, Node, Go, Rust — if it reads stdin and writes stdout, it's a Primordial agent. Push to GitHub, tag it, and anyone in the world can run it. 50 lines of code, one YAML manifest.

#### Plug thousands of specialist agents into Claude Code
One integration, instant access to a growing ecosystem of purpose-built agents. Claude Code discovers and runs them on its own — web research, data analysis, code generation, whatever you need. Every agent runs sandboxed in the cloud. Install Primordial, and Claude Code can use any of them.

> **AI agents (Claude Code, Codex, OpenClaw):** See [`Host-Integration-Skill.md`](Host-Integration-Skill.md) for setup instructions and usage reference.

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

### For Users

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/users/getting-started.md) | Install Primordial and run your first agent |
| [Background Service](docs/users/background-service.md) | How the background service works, logs, and troubleshooting |
| [Security](docs/users/security.md) | How your API keys and data are protected |

### For Agent Developers

| Guide | Description |
|-------|-------------|
| [Building Agents](docs/developers/building-agents.md) | Create an agent in Python, Node.js, or any language |
| [Protocol](docs/developers/protocol.md) | The NDJSON message format agents speak |
| [Manifest](docs/developers/manifest.md) | Complete `agent.yaml` reference |
| [API Setup](docs/developers/api-setup.md) | Configuring API keys and the security proxy |
| [Delegation](docs/developers/delegation.md) | Spawning and coordinating sub-agents |
| [Publishing](docs/developers/publishing.md) | Share your agent with the world |

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

