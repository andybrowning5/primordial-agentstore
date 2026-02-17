# Developing Agents for AgentStore

## The Idea

AgentStore is an open marketplace for AI agents. You build an agent, publish it, and anyone can run it — safely.

The core concept is simple: **we give your agent a sandbox, you give us a conversation loop.** Your agent starts up inside an isolated MicroVM, receives messages from the user over stdin, and sends responses back over stdout. That's it. What happens in between — which LLM you call, what tools you use, what language you write it in — is entirely up to you.

There's no opinionated framework to learn. No required language, LLM provider, or tool schema. You declare what permissions you need in a manifest, wire up the NDJSON message protocol, and you're done. AgentStore handles the sandbox, the networking, the dependency installation, and the user approval flow.

Think of it like Docker Hub for AI agents: you package your agent, users pull it and run it, and the platform ensures it can't do anything the user didn't agree to.

---

## Quick Start

```bash
# Python agent (default)
agentstore init my-agent
agentstore run ./my-agent

# Node.js agent
agentstore init my-agent --language node
```

---

## The Protocol

Every agent is a long-running process that speaks NDJSON (newline-delimited JSON) over stdin/stdout. The platform doesn't care what language you write it in — Python, Node.js, Rust, a bash script — as long as it speaks the protocol.

**Your agent must:**

1. Print `{"type": "ready"}` to stdout when it's ready to receive messages
2. Read NDJSON messages from stdin
3. For each `{"type": "message", "content": "...", "message_id": "..."}`, process it and write response(s) to stdout
4. Exit cleanly when it receives `{"type": "shutdown"}`

**Response messages:**

```json
{"type": "response", "content": "Hello!", "message_id": "msg_001", "done": true}
{"type": "activity", "tool": "web_search", "description": "Searching...", "message_id": "msg_001"}
{"type": "error", "error": "Something went wrong", "message_id": "msg_001"}
```

---

## Python Agents (with SDK)

The Python SDK handles the protocol for you. Subclass `Agent` and implement `handle_message`:

```python
from agentstore_sdk import Agent


class MyAgent(Agent):
    def setup(self):
        pass

    def handle_message(self, content: str, message_id: str):
        self.send_response(f"You said: {content}", message_id)

    def teardown(self):
        pass


def create_agent():
    return MyAgent()
```

**Manifest:**

```yaml
runtime:
  language: python
  entry_point: src/agent:create_agent
  dependencies: requirements.txt
```

The platform creates a venv, installs your deps with `uv`, injects the SDK, and bootstraps your agent automatically.

---

## Any-Language Agents (with run_command)

For non-Python agents, specify a `setup_command` and `run_command` instead:

```yaml
runtime:
  language: node
  setup_command: npm install
  run_command: node index.js
```

The platform copies your agent code into the sandbox, runs `setup_command` to install dependencies, then starts `run_command`. Your process must speak the NDJSON protocol on stdin/stdout.

Here's a minimal Node.js agent:

```javascript
const readline = require("readline");
const rl = readline.createInterface({ input: process.stdin });

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

send({ type: "ready" });

rl.on("line", async (line) => {
  const msg = JSON.parse(line);
  if (msg.type === "message") {
    send({ type: "response", content: `You said: ${msg.content}`, message_id: msg.message_id, done: true });
  } else if (msg.type === "shutdown") {
    process.exit(0);
  }
});
```

---

## Wrapping Existing Tools

You can wrap any existing CLI tool as an AgentStore agent using a bridge script. For example, here's how to wrap [OpenClaw](https://github.com/openclaw/openclaw):

```yaml
# agent.yaml
runtime:
  language: node
  setup_command: npm install -g openclaw@latest
  run_command: python3 bridge.py
  resources:
    max_memory: 4GB
    max_cpu: 4
```

```python
# bridge.py — translates between AgentStore protocol and OpenClaw CLI
import json, subprocess, sys

def send(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()

send({"type": "ready"})

for line in sys.stdin:
    msg = json.loads(line.strip())
    if msg["type"] == "shutdown":
        break
    if msg["type"] == "message":
        result = subprocess.run(
            ["openclaw", "agent", "--local", "--message", msg["content"], "--json"],
            capture_output=True, text=True, timeout=280,
        )
        # Parse and relay the response
        send({"type": "response", "content": result.stdout.strip(), "message_id": msg["message_id"], "done": True})
```

The same pattern works for any CLI tool that takes input and produces output.

---

## The Manifest

Every agent has an `agent.yaml`:

```yaml
name: my-agent                          # 3-40 chars, lowercase + hyphens
display_name: My Agent
version: 0.1.0
description: What this agent does

author:
  name: Your Name
  github: your-github-handle

runtime:
  language: python                      # or "node", or anything
  entry_point: src/agent:create_agent   # Python SDK agents
  # OR
  setup_command: npm install            # Generic agents
  run_command: node index.js            # Generic agents

  dependencies: requirements.txt        # Optional
  default_model:
    provider: anthropic
    model: claude-sonnet-4-5-20250929
  resources:
    max_memory: 2GB
    max_cpu: 2
    max_duration: 300
    max_session_duration: 3600

permissions:
  network:
    - domain: api.anthropic.com
      reason: LLM inference
  filesystem:
    workspace: readwrite                # none | readonly | readwrite
```

Use `entry_point` for Python SDK agents. Use `setup_command` + `run_command` for everything else.

---

## The Sandbox

Your agent runs inside an isolated MicroVM:

| Path | What it is |
|---|---|
| `/home/agent/workspace` | The user's project directory (mounted) |
| `/home/agent/agent` | Your agent code (copied in) |
| `/home/agent/state` | Persistent state directory (survives across sessions) |

Networking is deny-by-default — only domains declared in `permissions.network` are reachable (plus package registries for dependency installation). Resource limits from your manifest are enforced.

---

## Persistent State (Python SDK)

The SDK provides key-value state that survives across sessions:

```python
self.save_state("memory", {"conversations": 42})
data = self.load_state("memory", default={})
self.delete_state("old_key")
```

For non-SDK agents, read/write files directly in `/home/agent/state`.

---

## Running and Testing

```bash
agentstore run ./my-agent                           # Chat UI
agentstore run ./my-agent --workspace ~/projects    # Custom workspace
agentstore run ./my-agent --json-io                 # JSON pipe mode
agentstore run ./my-agent --yes                     # Skip approval

# Run from GitHub
agentstore run https://github.com/user/my-agent
agentstore run https://github.com/user/my-agent --ref v1.0.0
```
