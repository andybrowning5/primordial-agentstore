# Primordial AgentStore

I've been building something I'm really excited about: **Primordial AgentStore** — an open marketplace where anyone can publish an AI agent and anyone can run it safely.

The problem that kept bugging me: there's no good way to share AI agents. You can share code, but running someone else's agent means handing over your API keys and trusting arbitrary code on your machine. That's not an ecosystem — it's a gamble.

So I built one where trust isn't required.

**GitHub repo → running agent in under 30 seconds.** Browse available agents with `primordial search` — it spins up an isolated sandbox, handles your API keys securely, shows you exactly what permissions the agent needs, and you're chatting with it. That's it.

Every agent runs in its own microVM. Your API keys never touch the agent's code — they're protected by a security layer that keeps them invisible to the agent process. You approve every permission before anything runs. And as you use more agents, your encrypted key vault grows — the first time you add your Anthropic or OpenAI key, every future agent that needs it just works. No re-entering credentials. The more you use it, the faster setup gets.

For developers, the bar to publish an agent is intentionally low. No framework, no SDK. Your agent just reads and writes JSON lines over stdin/stdout. Python, Node, Rust, bash — anything works. Add an `agent.yaml` that declares which API keys and network domains your agent needs, push to GitHub, tag it with `primordial-agent`, and it shows up in the marketplace.

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

## Prerequisites

| Requirement | Details |
|-------------|---------|
| **Python** | 3.11+ |
| **pip** | Latest recommended |
| **OS** | macOS, Linux (Windows via WSL2) |

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
| [Building Agents](docs/building-agents.md) | Agent structure, examples, persistence, debugging |
| [Primordial Protocol](docs/primordial-protocol.md) | The NDJSON message protocol |
| [Agent Manifest](docs/agent-manifest.md) | Complete `agent.yaml` reference |
| [Setting Up APIs](docs/api-setup.md) | Configuring API keys and proxy routes |
| [Agent Delegation](docs/agent-delegation.md) | Spawning sub-agents |
| [Publishing Agents](docs/publishing.md) | Share your agent with others |
| [Security Architecture](docs/security.md) | Threat model, sandbox, key vault, proxy |

---

## Host Agent Setup

Primordial is designed to be called by host agents — coding assistants that delegate specialized tasks to purpose-built agents on the marketplace.

### Claude Code

Copy the skill file from this repo to your Claude Code skills directory:

```bash
mkdir -p ~/.claude/skills/primordial
cp Primordial-AgentStore-Skill.md ~/.claude/skills/primordial/skill.md
```

This teaches Claude Code how to search for, spawn, and interact with Primordial agents. See [`Primordial-AgentStore-Skill.md`](Primordial-AgentStore-Skill.md) for the full reference.

### OpenAI Codex CLI

Copy the skill file contents into your `AGENTS.md` (at `~/.codex/AGENTS.md` for global, or `./AGENTS.md` for per-project). Codex uses `AGENTS.md` the same way Claude Code uses skill files — as persistent instructions the agent reads at session start.

```bash
cat Primordial-AgentStore-Skill.md >> ~/.codex/AGENTS.md
```

### OpenClaw

OpenClaw uses a skills system — `SKILL.md` files in its workspace that get injected into the agent's system prompt. Create a Primordial skill:

```bash
mkdir -p ~/.openclaw/workspace/skills/primordial
cp Primordial-AgentStore-Skill.md ~/.openclaw/workspace/skills/primordial/SKILL.md
```

OpenClaw's agent will then call Primordial via its `exec` tool (e.g. `exec({ command: "primordial run <url> --agent" })`) whenever a task matches. If you're running sandboxed agents, make sure `primordial` is available inside the Docker container by adding it to your `agents.defaults.sandbox.docker.setupCommand` in `~/.openclaw/openclaw.json`:

```json5
{
  agents: {
    defaults: {
      sandbox: {
        docker: {
          setupCommand: "pip install primordial-agentstore"
        }
      }
    }
  }
}
```

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

