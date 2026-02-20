# LinkedIn Post — Primordial AgentStore

---

I've been building something I'm really excited about: **Primordial AgentStore** — an open marketplace where anyone can publish an AI agent and anyone can run it safely.

The problem that kept bugging me: there's no good way to share AI agents. You can share code, but running someone else's agent means handing over your API keys and trusting arbitrary code on your machine. That's not an ecosystem — it's a gamble.

So I built one where trust isn't required.

**GitHub repo → running agent in under 30 seconds.** Two commands:

```
pip install primordial-agentstore
primordial search
```

That's it. You browse available agents, pick one, and you're chatting with it. The CLI handles cloning the repo, spinning up an isolated sandbox, securing your API keys, and showing you exactly what permissions the agent needs before anything runs.

**Already have an agent? It takes about 10 minutes to make it Primordial-compatible.**

The Primordial Protocol is dead simple — your agent reads JSON from stdin and writes JSON to stdout. One line per message. If your agent already works as a CLI tool or chatbot, adapting it is just a thin wrapper:

```python
import json, sys

def send(msg):
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()

send({"type": "ready"})

for line in sys.stdin:
    msg = json.loads(line.strip())
    if msg["type"] == "shutdown":
        break
    if msg["type"] == "message":
        # Your existing agent logic goes here
        result = your_agent.run(msg["content"])
        send({"type": "response", "content": result,
              "message_id": msg["message_id"], "done": True})
```

Add an `agent.yaml` manifest declaring what API keys and network access you need, push to GitHub, add the `primordial-agent` topic tag — and your agent is live in the marketplace. No deploy pipeline. No infrastructure. Just a GitHub repo.

Python, Node, Rust, bash — anything that can read stdin and write stdout works. No framework lock-in. No SDK to install.

Every agent runs in its own Firecracker microVM. Your API keys never touch the agent's code — they're protected by a security proxy that keeps them invisible to the agent process. You approve every permission before anything runs.

**The use case I'm most excited about: agent delegation.**

Think about something like [OpenClaw](https://openclaw.ai/) — the open-source AI agent that's been blowing up lately (175k+ GitHub stars). It can already spin up instances of Claude Code to delegate work — coding tasks, file edits, research. That delegation pattern is incredibly powerful.

Primordial is a natural extension of that workflow. Instead of only delegating to general-purpose coding agents, imagine OpenClaw pulling in purpose-built specialists from a shared marketplace. Need real-time web research? Delegate to a research agent. Need task prioritization? Spin up a specialist. Need data analysis? There's an agent for that. Each one runs in its own sandbox with its own permissions — fully isolated, fully auditable.

The agents already exist as GitHub repos. OpenClaw (or any orchestrator) just needs to call `primordial run <repo> --agent-read` and it gets a sandboxed specialist communicating over stdin/stdout. Same delegation pattern it already uses, but with access to an entire ecosystem of purpose-built tools.

I'm early and the marketplace is small, but the infrastructure is solid and the developer experience is something I'm really proud of. If you're building agents and want a dead-simple way to share them — or if you have an existing agent you want to make available to others — check it out.

What kind of agents would you want available in a marketplace like this?

[github.com/andybrowning5/AgentStore](https://github.com/andybrowning5/AgentStore)

#AI #Agents #OpenSource #LLM #MultiAgentSystems
