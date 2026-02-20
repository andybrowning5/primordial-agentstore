# AgentStore Open Source Strategy

## Competitive Landscape

The "agent marketplace" space is fragmented. No one has built the unified discover → pull → sandbox → run experience yet:

- **E2B / Daytona** — Sandboxing only, no distribution
- **LangChain Hub** — Shares configs/prompts, not runnable agents
- **OpenAI GPT Store** — Massive distribution but shallow agents (no real code execution), creator monetization failed
- **MCP Registry** — Standardizes tools, not complete agents
- **ClawHub / OpenClaw** — Closest "npm for agents" but focuses on skills, not full agents
- **Hugging Face** — Model-centric, agents are secondary

### Docker cagent (Direct Competitor)

Docker's [cagent](https://github.com/docker/cagent) (2K+ stars, 130 releases) is the most direct competitor:

- Declarative YAML agent definitions
- `cagent run` to execute agents
- Publishes to Docker Hub / OCI registries
- MCP tool integration
- Backed by Docker's [E2B partnership](https://www.docker.com/blog/docker-e2b-building-the-future-of-trusted-ai/) for sandboxing

**Key difference**: cagent is a **no-code agent builder** (YAML configs wiring together tools). AgentStore hosts **arbitrary agent processes** — LangGraph pipelines, custom Python, anything that speaks NDJSON. Different audiences:

- **cagent**: "I want to wire together tools without writing code"
- **AgentStore**: "I built an agent and want others to run it safely"
---

## AgentStore's Position

The only project that unifies discover → pull → sandbox → run with a standardized manifest (`agent.yaml`) and protocol (Primordial Protocol/NDJSON), for **code-heavy agents** built with real frameworks (LangChain, DeepAgents, CrewAI, custom code).

---

## Release Readiness: 7/10

### What's Solid
- Key vault (Fernet encryption, PBKDF2, machine-bound)
- GitHub resolver with caching
- E2B sandbox manager with state persistence
- Multi-session support
- CLI architecture (setup, run, keys, cache, sessions, search)
