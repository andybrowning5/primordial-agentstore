# Developing Agents for AgentStore

## The Idea

AgentStore is an open marketplace for AI agents. You build an agent, publish it, and anyone can run it — safely.

The core concept is simple: **we give your agent a sandbox, you give us a conversation loop.** Your agent starts up inside an isolated MicroVM, receives messages from the user over stdin, and sends responses back over stdout. That's it. What happens in between — which LLM you call, what tools you use, how you manage state — is entirely up to you.

There's no opinionated framework to learn. No required LLM provider. No mandatory tool schema. You write a Python class with a `handle_message` method, declare what permissions you need in a manifest, and you're done. AgentStore handles the sandbox, the networking, the dependency installation, and the user approval flow.

Think of it like Docker Hub for AI agents: you package your agent, users pull it and run it, and the platform ensures it can't do anything the user didn't agree to.

---

## Quick Start

```bash
agentstore init my-agent
agentstore run ./my-agent
```

This scaffolds a working agent you can start editing immediately:

```
my-agent/
├── agent.yaml          # Manifest — what your agent is and what it needs
├── requirements.txt    # Python dependencies
├── src/
│   └── agent.py        # Your agent code
├── prompts/
│   └── system.md       # System prompt
└── .gitignore
```

---

## How It Works

Every agent is a long-running process that speaks a simple protocol: newline-delimited JSON (NDJSON) over stdin/stdout.

1. Your agent starts up and signals it's ready
2. The platform sends user messages in
3. Your agent processes them and sends responses back
4. When the session ends, your agent cleans up

The SDK handles the protocol plumbing. You just subclass `Agent` and implement `handle_message`:

```python
from agentstore_sdk import Agent


class MyAgent(Agent):
    def setup(self):
        # Called once at session start. Initialize your LLM client,
        # load state, set up whatever you need.
        pass

    def handle_message(self, content: str, message_id: str):
        # Called for each user message. Do your thing,
        # then send back a response.
        self.send_response(f"You said: {content}", message_id)

    def teardown(self):
        # Called at session end. Clean up resources.
        pass


def create_agent():
    return MyAgent()
```

You can call any LLM, use any framework (LangChain, LangGraph, CrewAI, raw API calls), run any tools, read/write files in the workspace — whatever your agent needs to do. The platform doesn't care about your internals, only the message protocol.

### Communicating with the User

Inside `handle_message`, you have three methods:

| Method | Purpose |
|---|---|
| `self.send_response(content, message_id)` | Send a reply to the user |
| `self.send_activity(tool, description, message_id)` | Show what your agent is doing (status updates) |
| `self.send_error(error, message_id)` | Report an error |

---

## The Manifest

Every agent has an `agent.yaml` that declares what it is and what it needs. This is what users see before they approve running your agent.

```yaml
name: my-agent
display_name: My Agent
version: 0.1.0
description: What this agent does, in one sentence

author:
  name: Your Name
  github: your-github-handle

runtime:
  entry_point: src/agent:create_agent   # module:function that returns your Agent
  dependencies: requirements.txt
  default_model:
    provider: anthropic
    model: claude-sonnet-4-5-20250929
  resources:
    max_memory: 2GB
    max_cpu: 2
    max_duration: 300                   # Max seconds per message
    max_session_duration: 3600          # Max session length

system_prompt: prompts/system.md

permissions:
  network:
    - domain: api.anthropic.com
      reason: LLM inference
  filesystem:
    workspace: readwrite
```

The key fields:

- **`entry_point`** — A `module:function` path to a factory function that returns your `Agent` instance. The platform calls this to start your agent.
- **`permissions.network`** — Every domain your agent needs to reach. The sandbox blocks everything else. Users see this list and must approve it.
- **`permissions.filesystem.workspace`** — Whether your agent can read/write the user's workspace directory (`none`, `readonly`, or `readwrite`).

---

## The Sandbox

Your agent runs inside an isolated MicroVM. Here's what's available:

| Path | What it is |
|---|---|
| `/home/agent/workspace` | The user's project directory (mounted) |
| `/home/agent/agent` | Your agent code (copied in) |
| `/home/agent/state` | Persistent state directory (survives across sessions) |

The sandbox comes with Python 3.11+ and `uv` pre-installed. Your `requirements.txt` dependencies are installed automatically before your agent starts.

Networking is deny-by-default. Only the domains you declare in `permissions.network` are reachable (plus PyPI, so your deps can install). Resource limits from your manifest are enforced — if your agent exceeds `max_duration` on a single message, it's terminated.

---

## Built-in Helpers

The SDK gives you filesystem, environment, and state management for free:

```python
# Read and write files
content = self.read_file("/home/agent/workspace/data.json")
self.write_file("/home/agent/workspace/output.txt", result)
matches = self.glob("/home/agent/workspace", "**/*.py")

# Access environment variables (API keys are injected automatically)
api_key = self.get_env("ANTHROPIC_API_KEY")

# Persistent state — survives across sessions
self.save_state("memory", {"conversations": 42})
data = self.load_state("memory", default={})
self.delete_state("old_key")
```

---

## Example: A Real Agent

Here's a complete agent that wraps Claude as a coding assistant:

```python
import anthropic
from agentstore_sdk import Agent


class CodingAssistant(Agent):
    def setup(self):
        self.client = anthropic.Anthropic()
        self.messages = []
        self.system = self.read_file("/home/agent/agent/prompts/system.md")

    def handle_message(self, content: str, message_id: str):
        self.messages.append({"role": "user", "content": content})

        self.send_activity("claude", "Thinking...", message_id)

        response = self.client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=4096,
            system=self.system,
            messages=self.messages,
        )

        reply = response.content[0].text
        self.messages.append({"role": "assistant", "content": reply})
        self.send_response(reply, message_id)

    def teardown(self):
        pass


def create_agent():
    return CodingAssistant()
```

You could just as easily use OpenAI, LangGraph, or anything else. The platform doesn't know or care which LLM is behind the curtain.

---

## Running and Testing

```bash
# Start a chat session with your agent
agentstore run ./my-agent

# Mount a specific workspace
agentstore run ./my-agent --workspace ~/projects/myapp

# JSON pipe mode (for programmatic / agent-to-agent use)
agentstore run ./my-agent --json-io

# Skip the approval prompt
agentstore run ./my-agent --yes
```

---

## Installing from GitHub

Users can run agents directly from a GitHub URL:

```bash
agentstore run https://github.com/user/my-agent
agentstore run https://github.com/user/my-agent --ref v1.0.0
```
