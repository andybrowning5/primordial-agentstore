# Building Agents for Primordial AgentStore

You build an agent. We give it a sandbox. Users run it safely.

Your agent is a long-running process that speaks the **Primordial Protocol** — newline-delimited JSON (NDJSON) over stdin/stdout. The platform doesn't care what language you write it in, which LLM you call, or what tools you use. Declare your permissions in a manifest, wire up the protocol, and you're done.

---

## The Primordial Protocol

### How it works (the intuition)

Think of your agent as a program that passes notes back and forth through a slot in a wall. Each note is one line of JSON. That's all NDJSON is — **N**ewline-**D**elimited **JSON**. One JSON object per line, no wrapping, no arrays.

```
┌─────────────────┐                    ┌─────────────────┐
│   AgentStore     │   stdin (notes →)  │    Your Agent    │
│   (the platform) │ ──────────────── → │    (your code)   │
│                  │   stdout (← notes) │                  │
│                  │ ← ──────────────── │                  │
└─────────────────┘                    └─────────────────┘
```

**stdin** = the platform writes to your agent (user messages, shutdown signals)
**stdout** = your agent writes back (responses, progress updates)

Here's what a full conversation looks like over the wire:

```
                                          Agent starts, does setup work
Agent → stdout:  {"type": "ready"}                                        ← "I'm alive"

                                          Platform shows the user a chat prompt.
                                          User types "Prioritize my tasks".

Platform → stdin: {"type": "message", "content": "Prioritize my tasks", "message_id": "msg_001"}

                                          Agent reads that line, thinks about it...

Agent → stdout:  {"type": "activity", "tool": "thinking", "description": "Analyzing..."}
                                                                          ← progress (optional)

Agent → stdout:  {"type": "response", "content": "1. Ship feature...", "message_id": "msg_001", "done": true}
                                                                          ← the answer

                                          User reads the response, types again...
                                          (cycle repeats)

Platform → stdin: {"type": "shutdown"}                                    ← "time to exit"
                                          Agent cleans up and exits.
```

The `message_id` ties responses back to the question that prompted them. The `done: true` flag tells the platform "I'm finished answering this one."

This design means **any language works** — Python, Node, Rust, even bash. There's no HTTP, no sockets, no framework. Just `print()` and `readline()`.

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
- Print debug logs to **stderr** — stdout is reserved for the Primordial Protocol
- Use `python -u` (unbuffered) or `flush=True` to avoid stdout buffering — without it, Python buffers output and the platform never sees your messages

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
  run_command: python -u src/agent.py   # Required — your agent's entrypoint
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

## Python Example

No SDK needed — just speak the protocol directly:

```python
import json
import sys

def send(msg):
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()

send({"type": "ready"})

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    msg = json.loads(line)

    if msg["type"] == "shutdown":
        break

    if msg["type"] == "message":
        mid = msg["message_id"]

        # Show progress
        send({"type": "activity", "tool": "thinking", "description": "Processing...", "message_id": mid})

        # Stream partial responses
        send({"type": "response", "content": "Working on it...", "message_id": mid, "done": False})

        # Final response
        send({"type": "response", "content": f"You said: {msg['content']}", "message_id": mid, "done": True})
```

---

## Persistence

Your agent's entire home directory (`/home/user/`) is saved between sessions. Write files, SQLite databases, `.md` notes, config files — whatever you want. It'll all be there next time the user resumes.

Users can maintain **multiple sessions** per agent. When launching, they choose to start fresh or resume a previous session. Each session gets its own isolated filesystem snapshot.

There's nothing to learn — just write files. The platform handles the rest.

```python
from pathlib import Path

# Check if we already registered with an external service
id_file = Path("/home/user/zep_user_id.txt")
if id_file.exists():
    user_id = id_file.read_text().strip()
else:
    user_id = register_with_service()
    id_file.write_text(user_id)

# Write logs, notes, whatever — it persists
log = Path("/home/user/conversation.log")
with log.open("a") as f:
    f.write("session started\n")
```

### What persists

```
/home/user/
├── agent/         # Your agent code (read-only, not persisted)
├── workspace/     # Agent's working directory
└── *everything else persists between sessions*
```

---

## Wrapping CLI Tools

Any CLI tool becomes an agent with a thin bridge:

```python
import json, subprocess, sys

def send(msg):
    sys.stdout.write(json.dumps(msg) + "\n")
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

## Agent Delegation

Agents can spawn other agents via `--agent-read` mode. The calling agent communicates with the sub-agent over the same Primordial Protocol:

```python
import json, subprocess

proc = subprocess.Popen(
    ["primordial", "run", "https://github.com/user/code-reviewer",
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
- **Network filtering** — domain-level outbound rules enforced via E2B
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
primordial run ./my-agent          # Interactive chat — easiest way to test
```

Tips:
- Use `python -u` (unbuffered) in `run_command` to avoid stdout buffering
- Print to **stderr** for debug logs — stdout is the Primordial Protocol
- Send `{"type": "activity", ...}` messages to show progress in the UI
- If your agent hangs, check for missing `done: true` or stdout buffering

| Symptom | Cause | Fix |
|---------|-------|-----|
| Agent never becomes ready | Missing `{"type": "ready"}` on stdout | Print `{"type": "ready"}` before reading stdin |
| User sees no response | Missing `done: true` on final response | Always end with `{"type": "response", ..., "done": true}` |
| State lost between sessions | Writing outside `/home/user/` | Write to `/home/user/` — everything there persists |
| Import errors on startup | Dependencies not installed | Check `setup_command` in manifest |
