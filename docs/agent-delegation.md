# Agent Delegation

Agents can spawn other agents as sub-agents. The parent communicates with the child over the same [Primordial Protocol](primordial-protocol.md) via `--agent-read` pipe mode.

## How It Works

1. Parent agent calls `primordial run <agent> --agent-read --yes` as a subprocess
2. Child agent starts in its own fresh Firecracker microVM
3. Parent sends messages on the child's stdin, reads responses from stdout
4. Child has its own manifest-derived permissions — the parent cannot escalate them

## Enable in Your Manifest

```yaml
permissions:
  delegation:
    enabled: true
```

## Python Example

```python
import json
import subprocess

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

# Shut down the sub-agent
proc.stdin.write(json.dumps({"type": "shutdown"}) + "\n")
proc.stdin.flush()
proc.wait()
```

## Security

- Each sub-agent runs in its **own fresh VM** with its own sandbox
- Sub-agent permissions come from its own manifest, not the parent's
- A parent cannot override or escalate a sub-agent's permissions
- API keys are scoped per-agent — a sub-agent only gets keys its manifest declares
