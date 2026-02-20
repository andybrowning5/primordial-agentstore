# Primordial AgentStore

**The digital soup from which agents emerge.**

An open marketplace for AI agents. You build an agent, publish it, and anyone can run it — safely inside an isolated Firecracker microVM. The core idea: **we give your agent a sandbox, you give us a conversation loop.** There's no opinionated framework, no required language or LLM provider. Declare your permissions in a manifest, wire up the NDJSON message protocol, and you're done. Think Docker Hub for AI agents.

---

## Features

- **Sandbox Isolation** — Every agent runs in a Firecracker microVM (~150ms startup) with enforced resource limits
- **Language-Agnostic Protocol** — Any language that can read stdin and write stdout works (Python, Node.js, Rust, bash…)
- **GitHub Agents** — Run agents directly from GitHub URLs with automatic caching
- **Encrypted Key Vault** — API keys encrypted at rest with Fernet (AES-128-CBC + HMAC-SHA256), derived via PBKDF2 from a machine-specific ID
- **Agent Delegation** — Agents can spawn sub-agents via `--json-io` pipe mode
- **Persistent State** — Three layers: config, structured state, and raw filesystem — all survive across sessions
- **Permission Approval** — Users see and approve every permission (network domains, filesystem access) before launch

---

## Quick Start

```bash
# Install
pip install agentstore

# Configure API keys (interactive)
agentstore setup

# Scaffold a new agent
agentstore init my-agent

# Run it
agentstore run ./my-agent
```

---

## CLI Reference

### `agentstore setup`

Interactive first-run wizard. Walks through known providers (Anthropic, OpenAI, Brave, Groq, Google, Mistral, DeepSeek, E2B) and stores encrypted API keys.

### `agentstore run <agent>`

Run an agent in a sandboxed environment.

```
agentstore run ./my-agent                                    # Local directory
agentstore run https://github.com/user/repo                  # GitHub URL
agentstore run https://github.com/user/repo --ref v1.0.0     # Specific git ref
agentstore run ./my-agent -w ~/project                       # Mount workspace
agentstore run ./my-agent -m anthropic:claude-sonnet-4-5-20250929  # Override model
agentstore run ./my-agent --json-io                          # NDJSON pipe mode
agentstore run ./my-agent --yes                              # Skip permission approval
agentstore run ./my-agent --timeout 600                      # Custom timeout
agentstore run ./my-agent --refresh                          # Force re-fetch GitHub agent
```

### `agentstore init <name>`

Scaffold a new agent project.

```
agentstore init my-agent                          # Python (default)
agentstore init my-agent --language node          # Node.js
agentstore init my-agent -d "Reviews PRs"         # With description
```

### `agentstore keys`

Manage API keys.

```
agentstore keys add                               # Interactive picker
agentstore keys add anthropic sk-...              # Direct add
agentstore keys add anthropic sk-... --key-id prod  # With custom ID
agentstore keys list                              # Show all stored keys
agentstore keys remove anthropic                  # Remove a key
```

### `agentstore cache`

Manage cached GitHub agent repos.

```
agentstore cache list                             # List cached repos
agentstore cache clear --all                      # Clear entire cache
agentstore cache clear https://github.com/u/repo  # Clear specific entry
```

---

## Agent Manifest (`agent.yaml`)

Every agent needs a manifest. Full field reference:

```yaml
name: my-agent                    # Required. 3-40 chars, lowercase + hyphens
display_name: My Agent            # Required. Human-readable name
version: 0.1.0                    # Required. Semver
description: >                    # Required. What the agent does (written for AI callers too)
  Analyzes code and finds bugs.
category: productivity            # Optional. e.g. productivity, demo
tags: [code, analysis]            # Optional. Searchable tags

author:
  name: Your Name                 # Required
  github: your-handle             # Optional

runtime:
  language: python                # Required. "python", "node", or any string
  run_command: python -u src/agent.py   # Required. The NDJSON process
  setup_command: pip install -r requirements.txt  # Optional. Runs once at startup
  dependencies: requirements.txt  # Optional. Checked for existence
  e2b_template: base              # Optional. Custom E2B sandbox template
  default_model:
    provider: anthropic           # Optional. LLM provider
    model: claude-sonnet-4-5-20250929  # Optional. Model ID
  resources:
    max_memory: 2GB               # Optional. Memory limit
    max_cpu: 2                    # Optional. CPU cores
    max_duration: 300             # Optional. Max seconds per request
    max_session_duration: 3600    # Optional. Max session lifetime in seconds

keys:                             # Optional. API keys the agent needs
  - provider: anthropic
    env_var: ANTHROPIC_API_KEY    # Injected as env var in sandbox
    required: true
  - provider: brave
    env_var: BRAVE_API_KEY
    required: false

permissions:
  network:                        # Optional. Allowed outbound domains
    - domain: api.anthropic.com
      reason: LLM inference
  network_unrestricted: false     # Optional. Full internet access (requires user approval)
  filesystem:
    workspace: readwrite          # none | readonly | readwrite
  delegation:
    enabled: false                # Whether the agent can spawn sub-agents
```

---

## The NDJSON Protocol

Every agent is a long-running process that communicates over stdin/stdout using newline-delimited JSON. The platform doesn't care what language you use — just speak the protocol.

### Lifecycle

1. Agent starts and prints `{"type": "ready"}` to stdout
2. Platform sends messages on stdin
3. Agent processes each message and writes responses to stdout
4. On `{"type": "shutdown"}`, agent cleans up and exits

### Message Types

**Inbound (stdin):**

| Type | Fields | Description |
|------|--------|-------------|
| `message` | `content`, `message_id` | User message to process |
| `shutdown` | — | Clean exit signal |

**Outbound (stdout):**

| Type | Fields | Description |
|------|--------|-------------|
| `ready` | — | Agent is ready to receive messages |
| `response` | `content`, `message_id`, `done` | Response text. Set `done: true` on the final chunk |
| `activity` | `tool`, `description`, `message_id` | Tool/progress indicator shown in UI |
| `error` | `error`, `message_id` | Error message |

---

## Python SDK

The SDK handles the NDJSON protocol for you. Subclass `Agent` and implement three methods:

```python
from agentstore_sdk import Agent


class MyAgent(Agent):

    def setup(self):
        """Called once when the session starts."""
        pass

    def handle_message(self, content: str, message_id: str):
        """Handle a user message. Must call self.send_response() at least once."""
        self.send_response(f"You said: {content}", message_id, done=True)

    def teardown(self):
        """Called when the session ends."""
        pass


if __name__ == "__main__":
    MyAgent().run_loop()
```

### I/O Helpers

```python
# Final response
self.send_response("Done!", message_id, done=True)

# Streaming (partial then final)
self.send_response("Working...", message_id, done=False)
self.send_response("Here's the result.", message_id, done=True)

# Tool activity indicator
self.send_activity("web_search", "Searching for docs...", message_id)

# Error
self.send_error("Something went wrong", message_id)
```

### Persistence

**Config** — small, agent-level settings (set once, read many):

```python
self.config.set("api_token", token)
token = self.config.get("api_token", None)
self.config.delete("old_key")
keys = self.config.keys()
```

**State** — structured data that changes frequently:

```python
self.save_state("memory", {"conversations": 42})
data = self.load_state("memory", default={})
keys = self.list_state_keys()
self.delete_state("old_key")
```

**Filesystem** — raw files at `self.state_dir` (mapped to `/home/user/state/` in sandbox):

```
/home/user/state/
├── config.json          # self.config (managed by SDK)
├── memory.json          # self.save_state("memory", ...)
└── ...                  # Any files you create
```

---

## Building Agents

### Python

```bash
agentstore init my-agent
```

This creates:

```
my-agent/
├── agent.yaml
├── src/
│   └── agent.py
├── requirements.txt
└── .gitignore
```

### Node.js

```bash
agentstore init my-agent --language node
```

Speak the protocol directly — no SDK required:

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
    send({
      type: "response",
      content: `You said: ${msg.content}`,
      message_id: msg.message_id,
      done: true,
    });
  } else if (msg.type === "shutdown") {
    process.exit(0);
  }
});
```

### Wrapping CLI Tools

Any CLI tool can become an agent with a thin bridge script:

```python
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
            ["some-cli-tool", "--message", msg["content"]],
            capture_output=True, text=True, timeout=280,
        )
        send({"type": "response", "content": result.stdout.strip(),
              "message_id": msg["message_id"], "done": True})
```

---

## Running Agents

### Local

```bash
agentstore run ./my-agent
```

### From GitHub

```bash
agentstore run https://github.com/user/my-agent
agentstore run https://github.com/user/my-agent --ref v1.0.0
```

GitHub agents are cached locally. Use `--refresh` to force re-fetch or `agentstore cache clear` to manage the cache.

### JSON Pipe Mode

Use `--json-io` for programmatic / agent-to-agent communication:

```bash
echo '{"type":"message","content":"hello","message_id":"1"}' | \
  agentstore run ./my-agent --json-io --yes 2>/dev/null
```

### Workspace Mounting

The user's project directory is mounted at `/home/user/workspace/` inside the sandbox. Control access via `permissions.filesystem.workspace` in the manifest (`none`, `readonly`, `readwrite`).

```bash
agentstore run ./my-agent -w ~/my-project
```

---

## Security Model

### Sandbox Isolation

Every agent runs inside an E2B Firecracker microVM with:

- No network access by default — each domain must be declared in the manifest with a reason
- No filesystem access beyond the agent's own directories unless declared
- Resource limits (memory, CPU, duration) enforced by the sandbox
- User approval required before any permissions are granted

### Key Vault

API keys are encrypted at rest using:

- **Fernet** (AES-128-CBC + HMAC-SHA256) for symmetric encryption
- **PBKDF2** (SHA-256, 600,000 iterations) to derive the encryption key
- Machine-specific identifier (platform UUID on macOS, `/etc/machine-id` on Linux) as key material
- Vault file stored with `0600` permissions
- Keys injected into agent sandboxes as environment variables at runtime — never written to disk inside the sandbox

### Sandbox Paths

| Path | Purpose |
|------|---------|
| `/home/user/workspace` | User's project directory (mounted from host) |
| `/home/user/agent` | Agent code (copied in) |
| `/home/user/state` | Persistent state directory (survives across sessions) |
| `/home/user/skill.md` | Built-in skill file for using Primordial from inside the sandbox |

---

## Agent Delegation

Agents can delegate tasks to other agents using `--json-io` mode:

```python
import json
import subprocess

proc = subprocess.Popen(
    ["agentstore", "run", "https://github.com/user/some-agent",
     "--json-io", "--yes", "-w", "/path/to/workspace"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True,
)

# Wait for ready
for line in proc.stdout:
    msg = json.loads(line.strip())
    if msg["type"] == "ready":
        break

# Send a task
proc.stdin.write(json.dumps({
    "type": "message",
    "content": "Analyze the code and find security issues.",
    "message_id": "task-1",
}) + "\n")
proc.stdin.flush()

# Collect responses
for line in proc.stdout:
    msg = json.loads(line.strip())
    if msg.get("done"):
        print(msg["content"])
        break

# Shut down
proc.stdin.write(json.dumps({"type": "shutdown"}) + "\n")
proc.stdin.flush()
proc.wait()
```

Enable delegation in the calling agent's manifest:

```yaml
permissions:
  delegation:
    enabled: true
```

---

## Project Structure

```
AgentStore/
├── packages/
│   └── client/
│       └── src/agentstore/
│           ├── cli/               # CLI commands (run, init, setup, keys, cache)
│           ├── sandbox/           # Sandbox manager (E2B/Firecracker)
│           ├── security/          # Key vault, permission handling
│           ├── config.py          # Platform-specific paths
│           ├── github.py          # GitHub URL resolver + caching
│           └── manifest.py        # agent.yaml loader + validation
├── sdk/                           # Python SDK (agentstore-sdk)
├── agent-template/                # Default agent template
├── examples/
│   ├── hello-agent/               # Minimal example agent
│   └── steve-agent/               # More complete example agent
├── docs/
│   ├── DEVELOPER_GUIDE.md         # SDK API reference + persistence guide
│   └── developing-agents.md       # Protocol, structure, delegation
├── pyproject.toml
├── Dockerfile.backend
└── docker-compose.yml
```

---

## Configuration Paths

AgentStore uses [`platformdirs`](https://github.com/platformdirs/platformdirs) for platform-appropriate data storage:

| Directory | macOS | Linux |
|-----------|-------|-------|
| Data (keys, state, agents) | `~/Library/Application Support/agentstore/` | `~/.local/share/agentstore/` |
| Cache (GitHub repos) | `~/Library/Caches/agentstore/` | `~/.cache/agentstore/` |

Key files within the data directory:

```
<data_dir>/
├── keys.enc           # Encrypted API key vault
├── agents/            # Installed agents
└── state/
    └── <agent-name>/  # Per-agent persistent state
```

---

## Examples

See the `examples/` directory:

- **`hello-agent`** — Minimal agent demonstrating the basic protocol
- **`steve-agent`** — More complete agent with tools and persistence

Run an example:

```bash
agentstore run ./examples/hello-agent
```

---

## Development

```bash
# Install in development mode
pip install -e ./packages/client

# Install the SDK
pip install -e ./sdk

# Run tests
pytest

# Lint
ruff check .
```

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `E2B_API_KEY` | Required for sandbox runtime (get one at [e2b.dev](https://e2b.dev)) |

---

## Debugging Tips

- Use `python -u` (unbuffered) in `run_command` to avoid stdout buffering issues
- Print to **stderr** for debug logs — stdout is reserved for the NDJSON protocol
- Use `self.send_activity()` to show progress in the UI during long operations
- If your agent hangs, check for missing `done: true` on responses or stdout buffering

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Agent never becomes ready | Missing `{"type": "ready"}` | Use `run_loop()` (SDK handles this) |
| User sees no response | `send_response` not called or `done` not `true` | Always call `self.send_response(..., done=True)` |
| State lost between sessions | Writing to wrong directory | Use `self.save_state()` or write to `self.state_dir` |
| Import errors on startup | Dependencies not installed | Check `setup_command` in manifest |
