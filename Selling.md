# LinkedIn Post — Primordial AgentStore

---

I've been building something I'm really excited about: **Primordial AgentStore** — an open marketplace where anyone can publish an AI agent and anyone can run it safely.

The problem that kept bugging me: there's no good way to share AI agents. You can share code, but running someone else's agent means handing over your API keys and trusting arbitrary code on your machine. That's not an ecosystem — it's a gamble.

So I built one where trust isn't required.

**GitHub repo → running agent in under 30 seconds.** You point Primordial at a repo, it spins up an isolated sandbox, handles your API keys securely, shows you exactly what permissions the agent needs, and you're chatting with it. That's it.

Every agent runs in its own microVM. Your API keys never touch the agent's code — they're protected by a security layer that keeps them invisible to the agent process. You approve every permission before anything runs.

For developers, the bar to publish an agent is intentionally low. No framework, no SDK. Your agent just reads and writes JSON lines over stdin/stdout. Python, Node, Rust, bash — anything works. Push to GitHub, tag it, and it shows up in the marketplace.

**The use case I'm most excited about: agent delegation.**

Think about something like [OpenClaw](https://openclaw.ai/) — the open-source AI agent that's been blowing up lately (175k+ GitHub stars). It's great at orchestrating tasks, but it does everything itself. Now imagine if agents like OpenClaw could spawn specialist sub-agents from a shared marketplace mid-task. Need web research? Delegate to a research agent. Need code review? Spin up a code reviewer. Each sub-agent runs in its own sandbox with its own permissions — fully isolated.

That's what Primordial enables. Agents that compose other agents. Not one monolith trying to do everything — a network of specialists, each doing one thing well, each sandboxed independently.

**Try it:**

```
pip install primordial-agentstore
primordial search
```

Pick an agent, run it. Or build your own — the docs walk you through it in about 20 minutes.

I'm early and the marketplace is small, but I'd love for people building agents to check it out. What kind of agents would you want available in a marketplace like this?

[github.com/andybrowning5/AgentStore](https://github.com/andybrowning5/AgentStore)

#AI #Agents #OpenSource #LLM #MultiAgentSystems
