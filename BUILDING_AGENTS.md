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
    max_duration: 300             # Max seconds per request
    max_session_duration: 3600    # Max session lifetime

keys:                             # API keys injected as env vars in the sandbox
  - provider: anthropic
    env_var: ANTHROPIC_API_KEY
    required: true
  - provider: zep
    env_var: ZEP_API_KEY
    required: false

permissions:
  network:                        # Each domain must be declared with a reason
    - domain: api.anthropic.com
      reason: LLM inference
    - domain: api.getzep.com
      reason: Long-term memory storage
  network_unrestricted: false     # true = full internet (requires user approval)
  filesystem:
    workspace: readwrite          # none | readonly | readwrite
  delegation:
    enabled: false                # Can this agent spawn sub-agents?
```

---

## Python SDK

The SDK handles the Ooze Protocol for you. Subclass `Agent` and implement three methods:

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

## State & Persistence

Your agent gets a persistent state directory at `/home/user/state/` inside the sandbox. Everything written here survives across sessions — restart the agent tomorrow and your data is still there.

There are three ways to persist data, from simplest to most flexible:

### 1. Config — Settings that rarely change

Think API tokens, user preferences, feature flags. Set once, read forever.

```python
def setup(self):
    # Check if we've already registered with an external service
    self.api_token = self.config.get("api_token", None)

    if not self.api_token:
        self.api_token = register_with_service()
        self.config.set("api_token", self.api_token)
```

Config writes flush to disk immediately. Use it for small values you set once and read many times.

### 2. State — Structured data that evolves

Think conversation history, task lists, cached results. The SDK gives you `save_state` and `load_state` for JSON-serializable data.

**Example: Maintaining memory with `memory.md` files**

```python
def setup(self):
    # Load existing memories from previous sessions
    self.memories = self.load_state("memories", default=[])

def handle_message(self, content: str, message_id: str):
    # Your agent does work...
    response = self.think(content)

    # Save important context as a memory
    if self.is_worth_remembering(content, response):
        self.memories.append({
            "user_said": content,
            "summary": self.summarize(response),
            "timestamp": datetime.now().isoformat(),
        })
        self.save_state("memories", self.memories)

    # You can also write a memory.md file for human-readable context
    memory_path = self.state_dir / "memory.md"
    memory_path.write_text(self.format_memories_as_markdown(self.memories))

    self.send_response(response, message_id, done=True)
```

**Example: Long-term memory with Zep**

[Zep](https://www.getzep.com/) gives your agent persistent, searchable memory across sessions — facts, summaries, and conversation history managed automatically.

```python
from zep_cloud.client import Zep

class MemoryAgent(Agent):

    def setup(self):
        # Zep API key is injected via the keys manifest field
        self.zep = Zep(api_key=os.environ["ZEP_API_KEY"])

        # Load or create a user session — this persists across restarts
        self.user_id = self.config.get("user_id", "default-user")
        self.session_id = self.config.get("session_id", None)

        if not self.session_id:
            self.session_id = f"session-{uuid.uuid4().hex[:8]}"
            self.config.set("session_id", self.session_id)
            self.zep.memory.add_session(session_id=self.session_id, user_id=self.user_id)

    def handle_message(self, content: str, message_id: str):
        # Search Zep for relevant memories before responding
        memories = self.zep.memory.search(
            self.session_id,
            text=content,
            limit=5,
        )
        context = "\n".join(m.message.content for m in memories.results)

        # Generate response using memories as context
        response = self.call_llm(content, context=context)

        # Store the exchange in Zep — it extracts facts and summaries automatically
        self.zep.memory.add(self.session_id, messages=[
            {"role": "user", "content": content},
            {"role": "assistant", "content": response},
        ])

        self.send_response(response, message_id, done=True)
```

The manifest for this agent would declare the Zep key and network access:

```yaml
keys:
  - provider: zep
    env_var: ZEP_API_KEY
    required: true

permissions:
  network:
    - domain: api.getzep.com
      reason: Long-term memory storage and retrieval
```

### 3. Filesystem — Raw files

Write anything to `self.state_dir` (mapped to `/home/user/state/` in the sandbox). SQLite databases, downloaded files, caches — whatever your agent needs.

```python
import sqlite3

def setup(self):
    db_path = self.state_dir / "agent.db"
    self.db = sqlite3.connect(db_path)
    self.db.execute("CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, content TEXT)")
```

### Where things live in the sandbox

```
/home/user/
├── workspace/     # User's project directory (mounted from host)
├── agent/         # Your agent code (copied in, read-only)
└── state/         # Persistent — survives across sessions
    ├── config.json    # self.config (managed by SDK)
    ├── memories.json  # self.save_state("memories", ...)
    ├── memory.md      # Any file you write here
    └── agent.db       # Databases, caches, whatever
```

---

## Node.js Agent

No SDK needed — just speak the Ooze Protocol directly:

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

```yaml
runtime:
  language: node
  setup_command: npm install
  run_command: node index.js
```

---

## Wrapping CLI Tools

Any CLI tool becomes an agent with a thin bridge script:

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
- **Resource limits** (memory, CPU, duration) enforced by the sandbox
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
| State lost between sessions | Writing to wrong directory | Use `self.save_state()` or write to `self.state_dir` |
| Import errors on startup | Dependencies not installed | Check `setup_command` in manifest |
