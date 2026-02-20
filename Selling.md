# LinkedIn Post — Primordial AgentStore

---

I've been building something I'm really excited about: **Primordial AgentStore** — an open marketplace where anyone can publish an AI agent and anyone can run it safely.

The problem that kept bugging me: there's no good way to share AI agents. You can share code, but running someone else's agent means handing over your API keys and trusting arbitrary code on your machine. That's not an ecosystem — it's a gamble.

So I built one where trust isn't required.

**GitHub repo → running agent in under 30 seconds.** You point Primordial at a repo — or browse available agents with `primordial search` — it spins up an isolated sandbox, handles your API keys securely, shows you exactly what permissions the agent needs, and you're chatting with it. That's it.

Every agent runs in its own microVM. Your API keys never touch the agent's code — they're protected by a security layer that keeps them invisible to the agent process. You approve every permission before anything runs. And as you use more agents, your encrypted key vault grows — the first time you add your Anthropic or OpenAI key, every future agent that needs it just works. No re-entering credentials. The more you use it, the faster setup gets.

For developers, the bar to publish an agent is intentionally low. No framework, no SDK. Your agent just reads and writes JSON lines over stdin/stdout. Python, Node, Rust, bash — anything works. Push to GitHub, tag it, and it shows up in the marketplace.

**The use case I'm most excited about: agent delegation.**

Think about [OpenClaw](https://openclaw.ai/) — the open-source AI agent that's taken off (175k+ GitHub stars). OpenClaw can already spin up instances of Claude Code and coordinate them to tackle coding work in parallel. That delegation pattern is incredibly powerful.

Primordial extends that workflow. Instead of only delegating to general-purpose coding agents, imagine OpenClaw pulling in purpose-built specialists from a shared marketplace mid-task. Need to scrape and summarize a competitor's changelog? Delegate to a web research agent. Need to generate a migration plan from your Postgres schema? Spin up a database specialist. Want to draft a PR description from a diff and post it to Slack? Chain a code review agent into a messaging agent. Each sub-agent runs in its own sandbox with its own permissions — fully isolated. And it plugs in the same way — stdin/stdout, just like the Claude Code instances OpenClaw already manages.

Agents that compose other agents. Not one monolith trying to do everything — a network of specialists, each doing one thing well, each sandboxed independently.

**Try it:**

```
pip install primordial-agentstore
primordial search
```

Pick an agent, run it. Or build your own — the docs walk you through it in about 20 minutes.

I'm early and the marketplace is small, but I'd love for people building agents to check it out. What kind of agents would you want available in a marketplace like this?

[github.com/andybrowning5/AgentStore](https://github.com/andybrowning5/AgentStore)

#AI #Agents #OpenSource #LLM #MultiAgentSystems
