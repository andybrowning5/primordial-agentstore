# Developing Agents for AgentStore

This guide covers everything you need to build, test, and publish agents on AgentStore.

---

## Quick Start

```bash
# Scaffold a new agent
agentstore init my-agent --mode single-shot

# Run it locally
agentstore run ./my-agent --task "Hello, world"
```

This creates:

```
my-agent/
├── agent.yaml          # Manifest — declares capabilities and permissions
├── requirements.txt    # Python dependencies
├── src/
│   └── agent.py        # Your agent code
├── prompts/
│   └── system.md       # System prompt
└── .gitignore
```

---

## Agent Modes

AgentStore supports two execution models.

### Single-Shot

Receives a task, does work, returns a result. Best for automation, code generation, analysis.

```python
def run(task: str, workspace: str) -> dict:
    # Do work...
    return {"summary": "Done", "files_created": 3}
```

The entry point is a plain function. It receives the user's task string and a workspace directory path, and returns a dict with results.

### Interactive

A conversational agent with back-and-forth messaging. Best for assistants, chat-based tools, multi-turn workflows.

```python
from agentstore_sdk import InteractiveAgent

class MyAgent(InteractiveAgent):
    def setup(self):
        self.history = []

    def handle_message(self, content: str, message_id: str):
        self.history.append(content)
        response = process(content, self.history)
        self.send_response(response, message_id)

    def teardown(self):
        pass

def create_agent():
    return MyAgent()
```

Interactive agents extend `InteractiveAgent` and must implement `handle_message`. The platform calls `setup()` once at session start and `teardown()` at session end.

**Communication methods** available inside `handle_message`:

| Method | Purpose |
|---|---|
| `self.send_response(content, message_id)` | Send a reply to the user |
| `self.send_activity(tool, description, message_id)` | Report tool usage (shown as status) |
| `self.send_error(error, message_id)` | Report an error |

---

## The Manifest (`agent.yaml`)

The manifest declares what your agent is, what it needs, and what it can do. Here's a fully annotated example:

```yaml
name: my-agent                        # Lowercase, alphanumeric + hyphens, 3-40 chars
display_name: My Agent
version: 0.1.0
description: A short description of what this agent does
category: general

author:
  name: Your Name
  github: your-github-handle           # Optional

runtime:
  language: python
  python_version: ">=3.11"
  entry_point: src/agent:run           # module.path:function_name
  dependencies: requirements.txt
  mode: single-shot                    # or "interactive"

  default_model:
    provider: anthropic
    model: claude-sonnet-4-5-20250929

  resources:
    max_memory: 2GB
    max_cpu: 2
    max_duration: 300                  # Seconds per task
    max_output_size: 10MB
    max_session_duration: 3600         # Interactive only — max session length

system_prompt: prompts/system.md       # Path to system prompt file

permissions:
  network:
    - domain: api.anthropic.com
      reason: LLM inference
  filesystem:
    workspace: readwrite               # none | readonly | readwrite
  delegation:
    enabled: false
    allowed_agents: []

tags:
  - automation
  - code
```

### Entry Point Format

The `entry_point` field uses `module.path:function_name` syntax:

- **Single-shot**: Points to a function with signature `run(task: str, workspace: str) -> dict`
- **Interactive**: Points to a factory function that returns an `InteractiveAgent` instance

Examples:
```yaml
entry_point: src/agent:run              # src/agent.py → run()
entry_point: src/agent:create_agent     # src/agent.py → create_agent()
entry_point: mypackage.core:main        # mypackage/core.py → main()
```

### Permissions

Agents run inside isolated sandboxes with deny-by-default networking. You must declare every domain your agent needs:

```yaml
permissions:
  network:
    - domain: api.anthropic.com
      reason: LLM inference via Claude API
    - domain: api.github.com
      reason: Fetching repository data
  filesystem:
    workspace: readwrite
```

Users see these permissions and must approve them before the agent runs.

---

## SDK Reference

Install: agents running on AgentStore get the SDK automatically. For local development:

```bash
pip install agentstore-sdk
```

### Imports

```python
from agentstore_sdk import (
    BaseAgent,           # Base class for single-shot agents
    InteractiveAgent,    # Base class for interactive agents
    tool,                # Decorator to mark methods as tools
)
```

### Filesystem Helpers

All agents inherit these methods:

```python
# Read a file
content = self.read_file("/home/agent/workspace/data.json")

# Write a file (creates parent directories)
self.write_file("/home/agent/workspace/output.txt", "results here")

# Find files by pattern
py_files = self.glob("/home/agent/workspace", "**/*.py")
```

### Environment Variables

API keys configured by the user are injected as environment variables:

```python
api_key = self.get_env("ANTHROPIC_API_KEY")
```

### Persistent State

State survives across runs of the same agent. Use it for caches, user preferences, learned context:

```python
# Save structured data
self.save_state("user_prefs", {"theme": "dark", "lang": "en"})

# Load it back (with optional default)
prefs = self.load_state("user_prefs", default={})

# Manage keys
keys = self.list_state_keys()
self.delete_state("old_key")
```

### The `@tool` Decorator

Mark methods as agent capabilities:

```python
from agentstore_sdk import tool

class MyAgent(InteractiveAgent):
    @tool(description="Search the web for information")
    def web_search(self, query: str) -> str:
        # ...
        return results
```

---

## Example: Single-Shot Agent

A minimal agent that summarizes workspace contents:

**`agent.yaml`**
```yaml
name: file-counter
display_name: File Counter
version: 0.1.0
description: Counts and categorizes files in the workspace
author:
  name: Dev
runtime:
  entry_point: src/agent:run
  mode: single-shot
  resources:
    max_duration: 60
system_prompt: prompts/system.md
permissions:
  filesystem:
    workspace: readonly
```

**`src/agent.py`**
```python
import os

def run(task: str, workspace: str) -> dict:
    files = []
    for root, _, filenames in os.walk(workspace):
        for f in filenames:
            if not f.startswith("."):
                files.append(os.path.relpath(os.path.join(root, f), workspace))

    by_ext = {}
    for f in files:
        ext = os.path.splitext(f)[1] or "(none)"
        by_ext.setdefault(ext, []).append(f)

    return {
        "total_files": len(files),
        "by_extension": {k: len(v) for k, v in by_ext.items()},
        "files": files,
    }
```

## Example: Interactive Agent

A conversational agent powered by Claude:

**`agent.yaml`**
```yaml
name: chat-assistant
display_name: Chat Assistant
version: 0.1.0
description: A conversational assistant
author:
  name: Dev
runtime:
  entry_point: src/agent:create_agent
  mode: interactive
  resources:
    max_duration: 300
    max_session_duration: 3600
system_prompt: prompts/system.md
permissions:
  network:
    - domain: api.anthropic.com
      reason: LLM inference
  filesystem:
    workspace: readwrite
```

**`src/agent.py`**
```python
import anthropic
from agentstore_sdk import InteractiveAgent

class ChatAssistant(InteractiveAgent):
    def setup(self):
        self.client = anthropic.Anthropic()
        self.messages = []

    def handle_message(self, content: str, message_id: str):
        self.messages.append({"role": "user", "content": content})

        response = self.client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=4096,
            system=self.read_file("/home/agent/agent/prompts/system.md"),
            messages=self.messages,
        )

        reply = response.content[0].text
        self.messages.append({"role": "assistant", "content": reply})
        self.send_response(reply, message_id)

    def teardown(self):
        pass

def create_agent():
    return ChatAssistant()
```

---

## Testing Locally

```bash
# Single-shot
agentstore run ./my-agent --task "Analyze this project"

# Single-shot with custom workspace
agentstore run ./my-agent --task "Count files" --workspace ~/projects/myapp

# Interactive (chat UI)
agentstore run ./my-agent

# Interactive (JSON pipe mode for programmatic use)
agentstore run ./my-agent --json-io

# Skip approval prompt
agentstore run ./my-agent --task "test" --yes
```

---

## Sandbox Environment

Your agent runs inside an isolated MicroVM with:

- **Python 3.11+** with `uv` for fast package installation
- **Deny-by-default networking** — only domains you declare in `permissions.network` are reachable (plus PyPI for dependency installation)
- **Workspace mount** at `/home/agent/workspace` — this is the user's project directory
- **Agent code** at `/home/agent/agent`
- **State directory** at `/home/agent/state` — persistent across runs

Resource limits from your manifest are enforced. If your agent exceeds `max_duration`, it is terminated.

---

## Project Structure Conventions

```
my-agent/
├── agent.yaml              # Required — the manifest
├── requirements.txt        # Required — Python dependencies
├── src/
│   └── agent.py            # Required — entry point module
├── prompts/
│   └── system.md           # Required — system prompt
├── tests/                  # Optional — your tests
└── .gitignore
```

You can organize `src/` however you like — subdirectories, multiple modules, etc. Just make sure `entry_point` in the manifest points to the right `module:function`.
