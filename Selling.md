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

Think about something like [OpenClaw](https://openclaw.ai/) — the open-source AI agent that's been blowing up lately (175k+ GitHub stars). It can already spin up a terminal and orchestrate a team of Claude Code or Codex agents. Now imagine if agents like OpenClaw could also spawn specialist sub-agents from a shared marketplace mid-task. Need web research? Delegate to a research agent. Need task prioritization? Spin up a specialist. Each sub-agent runs in its own sandbox with its own permissions — fully isolated.

That's what Primordial enables. Agents that compose other agents. Not one monolith trying to do everything — a network of specialists, each doing one thing well, each sandboxed independently.

I'm early and the marketplace is small, but the infrastructure is solid and the developer experience is something I'm really proud of. If you're building agents and want a dead-simple way to share them — or if you have an existing agent you want to make available to others — check it out.

What kind of agents would you want available in a marketplace like this?

[github.com/andybrowning5/AgentStore](https://github.com/andybrowning5/AgentStore)

#AI #Agents #OpenSource #LLM #MultiAgentSystems
