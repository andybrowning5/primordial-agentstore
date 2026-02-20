# Building Agents for Primordial AgentStore

You build an agent. We give it a sandbox. Users run it safely.

Your agent is a long-running process that speaks the **Ooze Protocol** — newline-delimited JSON (NDJSON) over stdin/stdout. The platform doesn't care what language you write it in, which LLM you call, or what tools you use. Declare your permissions in a manifest, wire up the protocol, and you're done.

---

## The Ooze Protocol

Every agent is a process that reads NDJSON from stdin and writes NDJSON to stdout. That's it.

### Lifecycle

1. Your agent starts up and prints `{"type": "ready"}` to stdout
2. The platform sends user messages on stdin
3. Your agent processes each message and writes responses to stdout
4. On `{"type": "shutdown"}`, your agent cleans up and exits

### Message Types

**Inbound (stdin):**

```json
{"type": "message", "content": "User's question or task", "message_id": "msg_001"}
{"type": "shutdown"}
```

**Outbound (stdout):**

```json
{"type": "ready"}
{"type": "response", "content": "Answer text", "message_id": "msg_001", "done": true}
{"type": "response", "content": "Partial...", "message_id": "msg_001", "done": false}
{"type": "activity", "tool": "web_search", "description": "Searching...", "message_id": "msg_001"}
{"type": "error", "error": "Something went wrong", "message_id": "msg_001"}
```

**Rules:**
- Every message response chain must end with a `response` where `done: true`
- Use `activity` messages to show progress in the UI (tool usage, loading indicators)
- Print debug logs to **stderr** — stdout is reserved for the Ooze Protocol
- Use `python -u` (unbuffered) to avoid stdout buffering issues

---

## Agent Structure

Every agent needs two files at minimum:

```
my-agent/
├── agent.yaml          # Manifest — identity, runtime, permissions
└── src/
    └── agent.py        # Your agent code (or any entrypoint)
```

---

## The Manifest (`agent.yaml`)

The manifest tells the platform what your agent is and what it needs.

```yaml
name: my-agent                    # 3-40 chars, lowercase + hyphens
display_name: My Agent            # Human-readable name
version: 0.1.0                    # Semver
description: >                    # What the agent does — write this for AI callers too,
  Analyzes code and finds bugs.   # so other agents know when to delegate to yours.

author:
  name: Your Name
  github: your-handle

runtime:
  language: python                # "python", "node", or anything
  run_command: python -u src/agent.py   # Required — the Ooze Protocol process
  setup_command: pip install -r requirements.txt  # Optional — runs once at sandbox startup
  dependencies: requirements.txt  # Optional — checked for existence
  default_model:
    provider: anthropic
    model: claude-sonnet-4-5-20250929
  resources:
    max_memory: 2GB
    max_cpu: 2

keys:                             # API keys injected as env vars in the sandbox
  - provider: anthropic
    env_var: ANTHROPIC_API_KEY
    required: true

permissions:
  network:                        # Each domain must be declared with a reason
    - domain: api.anthropic.com
      reason: LLM inference
  network_unrestricted: false     # true = full internet (requires user approval)
  filesystem:
    workspace: readwrite          # none | readonly | readwrite
  delegation:
    enabled: false                # Can this agent spawn sub-agents?
```

---

## Python SDK

The SDK handles the Ooze Protocol for you. Subclass `Agent` and implement `handle_message`:

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

# Streaming — send partial chunks, then finalize
self.send_response("Working on it...", message_id, done=False)
self.send_response("Here's the answer.", message_id, done=True)

# Show tool activity in the UI
self.send_activity("web_search", "Searching for docs...", message_id)

# Report an error
self.send_error("Something went wrong", message_id)
```

---

## Persistence

Your agent's entire home directory (`/home/user/`) is saved between sessions. Write files, SQLite databases, `.md` notes, config files — whatever you want. It'll all be there next time the user resumes.

Users can maintain **multiple sessions** per agent. When launching, they choose to start fresh or resume a previous session. Each session gets its own isolated filesystem snapshot.

There's nothing to learn — just write files. The platform handles the rest.

```python
from pathlib import Path

class MyAgent(Agent):

    def setup(self):
        # Check if we already registered with an external service
        id_file = Path("/home/user/zep_user_id.txt")
        if id_file.exists():
            self.user_id = id_file.read_text().strip()
        else:
            self.user_id = register_with_service()
            id_file.write_text(self.user_id)

    def handle_message(self, content: str, message_id: str):
        # Write notes, logs, whatever — it persists
        log = Path("/home/user/conversation.log")
        with log.open("a") as f:
            f.write(f"user: {content}\n")

        response = self.think(content)

        with log.open("a") as f:
            f.write(f"agent: {response}\n")

        self.send_response(response, message_id, done=True)
```

### What persists

```
/home/user/
├── agent/         # Your agent code (read-only, not persisted)
├── workspace/     # User's project directory (mounted from host)
└── *everything else persists between sessions*
```

---

## Wrapping CLI Tools

Any CLI tool becomes an agent with the SDK:

```python
import subprocess
from agentstore_sdk import Agent

class CLIAgent(Agent):

    def handle_message(self, content: str, message_id: str):
        result = subprocess.run(
            ["some-cli-tool", "--message", content],
            capture_output=True, text=True, timeout=280,
        )
        self.send_response(result.stdout.strip(), message_id)

if __name__ == "__main__":
    CLIAgent().run_loop()
```

---

## Agent Delegation

Agents can spawn other agents via `--agent-read` mode. The calling agent communicates with the sub-agent over the same Ooze Protocol:

```python
import json, subprocess

proc = subprocess.Popen(
    ["agentstore", "run", "https://github.com/user/code-reviewer",
     "--agent-read", "--yes"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True,
)

# Wait for ready
for line in proc.stdout:
    if json.loads(line.strip())["type"] == "ready":
        break

# Delegate a task
proc.stdin.write(json.dumps({
    "type": "message",
    "content": "Review the code in the workspace for security issues.",
    "message_id": "review-1",
}) + "\n")
proc.stdin.flush()

# Collect the response
for line in proc.stdout:
    msg = json.loads(line.strip())
    if msg.get("done"):
        print(msg["content"])
        break

proc.stdin.write(json.dumps({"type": "shutdown"}) + "\n")
proc.stdin.flush()
proc.wait()
```

Enable in your manifest:

```yaml
permissions:
  delegation:
    enabled: true
```

---

## Security Model

Your agent runs inside an E2B Firecracker microVM (~150ms startup):

- **No network by default** — every domain must be declared in the manifest with a reason
- **No filesystem access** beyond the agent's own directories unless declared
- **Resource limits** (memory, CPU) enforced by the sandbox
- **User approval** required before permissions are granted
- **API keys** encrypted at rest with Fernet (AES-128-CBC + HMAC-SHA256), injected as env vars at runtime

Best practices:
- Request the minimum permissions your agent needs
- Explain *why* in the `reason` field for each network domain
- Use `workspace: readonly` unless you genuinely need to write
- Never store secrets in state — use the `keys` mechanism

---

## Debugging

```bash
agentstore run ./my-agent          # Interactive chat — easiest way to test
```

Tips:
- Use `python -u` (unbuffered) in `run_command` to avoid stdout buffering
- Print to **stderr** for debug logs — stdout is the Ooze Protocol
- Use `self.send_activity()` to show progress in the UI
- If your agent hangs, check for missing `done: true` or stdout buffering

| Symptom | Cause | Fix |
|---------|-------|-----|
| Agent never becomes ready | Missing `{"type": "ready"}` | Use `run_loop()` — the SDK handles this |
| User sees no response | `send_response` not called or `done` not `true` | Always end with `self.send_response(..., done=True)` |
| State lost between sessions | Writing outside `/home/user/` | Write to `/home/user/` — everything there persists |
| Import errors on startup | Dependencies not installed | Check `setup_command` in manifest |
