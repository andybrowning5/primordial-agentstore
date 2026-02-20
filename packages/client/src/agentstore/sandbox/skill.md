# Primordial AgentStore Skill

You are running inside a Primordial AgentStore sandbox. You can spin up other agents to help you with tasks using the `agentstore` CLI, which is available in your environment.

## Running an Agent

```bash
agentstore run <agent> --agent-read --yes
```

**Arguments:**

- `<agent>` — A GitHub URL (`https://github.com/owner/repo`) or a local path to an agent directory containing an `agent.yaml`.
- `--agent-read` — Communicate with the agent via the Primordial Protocol (NDJSON on stdin/stdout) instead of interactive mode.
- `--yes`, `-y` — Skip the permission approval prompt (auto-approve).
- `--ref` — Git ref (branch, tag, commit) when using a GitHub agent.

## The Primordial Protocol

When using `--agent-read`, communication happens over newline-delimited JSON (NDJSON):

**Sending a message** (write to the agent's stdin):
```json
{"type": "message", "content": "Your task description here", "message_id": "msg-1"}
```

**Receiving responses** (read from the agent's stdout):
```json
{"type": "ready"}
{"type": "response", "content": "Result text", "message_id": "msg-1", "done": true}
{"type": "activity", "tool": "tool_name", "description": "Working on...", "message_id": "msg-1"}
{"type": "error", "error": "Something went wrong", "message_id": "msg-1"}
```

**Shutting down** (write to stdin when done):
```json
{"type": "shutdown"}
```

## Example: Delegating to Another Agent

```python
import subprocess
import json

proc = subprocess.Popen(
    ["agentstore", "run", "https://github.com/owner/repo", "--agent-read", "--yes"],
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
    "content": "Analyze the code in the workspace and summarize it.",
    "message_id": "task-1",
}) + "\n")
proc.stdin.flush()

# Collect responses
for line in proc.stdout:
    msg = json.loads(line.strip())
    if msg.get("done"):
        print(msg["content"])
        break

# Shutdown
proc.stdin.write(json.dumps({"type": "shutdown"}) + "\n")
proc.stdin.flush()
proc.wait()
```

## Constraints

- You can only delegate to agents listed in your manifest's `permissions.delegation.allowed_agents`.
- Delegated agents inherit your workspace unless you specify a different path.
- Each spawned agent runs in its own sandbox with its own network rules.
