# Building Agents

You build an agent. We give it a sandbox. Users run it safely.

Your agent is a long-running process that speaks the [Primordial Protocol](primordial-protocol.md) — NDJSON over stdin/stdout. The platform doesn't care what language you write it in, which LLM you call, or what tools you use. Declare your permissions in a [manifest](agent-manifest.md), wire up the protocol, and you're done.

## Agent Structure

Every agent needs two files at minimum:

```
my-agent/
├── agent.yaml          # Manifest — identity, runtime, permissions
└── src/
    └── agent.py        # Your agent code (or any entrypoint)
```

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

## Persistence

Your agent's home directory (`/home/user/`) is saved between sessions. Write files, SQLite databases, config files — whatever you want. It'll all be there next time the user resumes.

Users can maintain **multiple sessions** per agent. Each session gets its own isolated filesystem snapshot.

```python
from pathlib import Path

# Check if we already registered with an external service
id_file = Path("/home/user/data/user_id.txt")
if id_file.exists():
    user_id = id_file.read_text().strip()
else:
    user_id = register_with_service()
    id_file.parent.mkdir(parents=True, exist_ok=True)
    id_file.write_text(user_id)
```

### What persists

Only these subdirectories of `/home/user/` are saved:

```
/home/user/
├── agent/         # Your agent code (read-only, not persisted)
├── workspace/     # Working directory ✓
├── data/          # Data files ✓
├── output/        # Output files ✓
└── state/         # State files ✓
```

Everything else (dotfiles, `.config/`, `.local/`, `.ssh/`) is excluded for security.

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

## Security Best Practices

Your agent runs inside a Firecracker microVM:

- **No network by default** — every domain must be declared with a reason
- **API keys** are injected via a security proxy, never as plain env vars
- **User approval** is required before permissions are granted

Best practices:
- Request the minimum permissions your agent needs
- Explain *why* in the `reason` field for each network domain
- Use `workspace: readonly` unless you genuinely need to write
- Never store secrets in state — use the `keys` mechanism

## Debugging

```bash
primordial run ./my-agent          # Interactive chat — easiest way to test
```

Tips:
- Use `python -u` (unbuffered) in `run_command` to avoid stdout buffering
- Print to **stderr** for debug logs — stdout is the Primordial Protocol
- Send `activity` messages to show progress in the UI
- If your agent hangs, check for missing `done: true` or stdout buffering

| Symptom | Cause | Fix |
|---------|-------|-----|
| Agent never becomes ready | Missing `{"type": "ready"}` on stdout | Print ready message before reading stdin |
| User sees no response | Missing `done: true` | Always end with `done: true` |
| State lost between sessions | Writing outside allowed dirs | Write to `workspace/`, `data/`, `output/`, or `state/` |
| Import errors on startup | Dependencies not installed | Check `setup_command` in manifest |

## Next Steps

- [Manifest reference](agent-manifest.md) — every field and validation rule
- [Custom providers](custom-providers.md) — using non-built-in APIs
- [Agent delegation](agent-delegation.md) — spawning sub-agents
- [Publishing](publishing.md) — share your agent with others
