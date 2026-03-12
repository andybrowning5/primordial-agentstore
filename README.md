# Primordial AgentStore

An open-source marketplace for AI agents. Just as life evolved from single cells into specialized, energy-efficient organisms, AI agents will follow the same path — small, focused models that do one thing well and compose into something greater than any monolith. Primordial is the substrate. Anyone can publish an agent, anyone can run it safely — no trust required. Agents run in the cloud, and agents never access your API keys directly. Claude Code can discover and call on any agent in the ecosystem mid-task — giving it access to a growing library of specialists.

**→ [Get started](docs/users/getting-started.md)**

#### Run any AI agent safely in seconds
Pick an agent, approve its permissions, it's live — running in a cloud sandbox, not on your machine. Your API keys never touch the agent code. No Docker, no config, no trust required.

#### Build an agent in any language, zero SDK
NDJSON over stdin/stdout. That's the whole protocol. Python, Node, Go, Rust — if it reads stdin and writes stdout, it's a Primordial agent. Push to GitHub, tag it, and anyone in the world can run it. 50 lines of code, one YAML manifest.

#### Plug a growing ecosystem of specialist agents into Claude Code
One integration, instant access to a growing ecosystem of purpose-built agents. Claude Code discovers and runs them on its own — web research, data analysis, code generation, whatever you need. Every agent runs sandboxed in the cloud. Install Primordial, and Claude Code can use any of them.

> [!NOTE]
> This project is in **beta**. Every reasonable effort has been made to keep it secure. That said, this is open-source software under active development. **Use at your own risk.** Review agent permissions before approving them, and don't run untrusted agents with access to sensitive data or keys you can't rotate.

> **AI agents (Claude Code, Codex, OpenClaw):** Run `primordial install --claude`, `--codex`, or `--openclaw` to install the host-specific skill. See [Getting Started](docs/users/getting-started.md).

---

## Demo
Spawning a simple web research agent from the Primordial CLI.

https://github.com/user-attachments/assets/bc604c03-2158-4a3b-84a4-117191b96ec1


## Primordial Sub-Agents Demo
Here, we spawn 3 web research agents as sub agents. Any agents can be configured to delegate tasks to other agents available on Primordial AgentStore!

https://github.com/user-attachments/assets/a0c8252d-11c6-4677-bbb0-71a678000391

## Running Primordial Agents From Claude Code
In this demo, Claude Code delegates a task to a Primordial agent that checks codebases for documentation drift against the source code. The agent is sourced from the Primordial AgentStore and runs against the git repo rooted in the directory it's called from. See the Workspace Isolation docs for more on how Primordial agents access your codebase.

https://github.com/user-attachments/assets/16a0c9f5-38d8-4542-97fb-5b0d795ec48a

---

## CLI Commands

```bash
primordial search              # Browse all agents on the marketplace
primordial search "query"      # Semantic search by capability (e.g. "web research")
primordial search --agent      # JSON output for host agents (Claude Code, etc.)
primordial run <agent>                    # Run an agent by GitHub URL or path
primordial run <agent> --workspace <path> # Give the agent access to a git repo (resolves to git root)
primordial run <agent> --agent           # Host-agent mode (NDJSON conversation)
primordial install --claude    # Set up Claude Code integration (skill + daemon)
primordial serve               # Start the background daemon (HTTP API on localhost)
primordial setup               # Configure API keys interactively
primordial keys add <provider> # Add a specific API key
primordial keys list           # List stored keys
primordial sessions <agent>    # Manage chat sessions for an agent
primordial cache list|clear    # View or clear cached agent repos
primordial restart             # Restart the background daemon (after upgrades)
```

Use `--workspace <path>` with `primordial run` to give the agent read access to your project directory.

---

## Documentation

### For Users

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/users/getting-started.md) | Install Primordial and run your first agent |
| [Agent Search](docs/users/agent-search.md) | How semantic search works and how to find the right agent |
| [Background Service](docs/users/background-service.md) | How the background service works, logs, and troubleshooting |
| [Security](docs/users/security.md) | How your API keys and data are protected |
| [Workspace Isolation](docs/users/workspace-isolation.md) | How agents read and modify your code safely via git worktrees |

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
│           ├── skills/            # Host integration skill files (Claude, Codex, OpenClaw)
│           ├── config.py          # Platform-specific paths
│           ├── discovery.py       # GitHub agent search + cache enrichment
│           ├── github.py          # GitHub URL resolver + caching
│           ├── manifest.py        # agent.yaml loader + validation
│           ├── models.py          # Data models (manifest, permissions, keys)
│           ├── ranking.py         # Semantic search ranking (FastEmbed)
│           └── worktree.py        # Git worktree isolation for workspaces
└── docs/                          # Full documentation (users + developers)
```


