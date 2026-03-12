---
name: primordial
description: Search for and use specialist AI agents on the Primordial AgentStore. Use when delegating tasks to purpose-built agents (web research, data analysis, code review, etc.) or when the user says "use primordial", "find an agent", or "delegate this".
---

# Primordial AgentStore — Tool Integration

Primordial is an HTTP API running on localhost that lets you search for and use specialist tools hosted on the Primordial AgentStore. Each tool runs in an isolated sandbox.

**This is NOT a sub-agent. Do not use agent spawning. Use curl/bash directly.**

## How It Works

All interactions use `curl` against `http://localhost:19400`. No process management, no agent spawning — just HTTP requests.

All POST requests require a bearer token:
```bash
TOKEN=$(cat ~/.primordial-daemon-token 2>/dev/null)
```

## Check if Available

```bash
curl -s http://localhost:19400/health
```

If this fails, tell the user: "Primordial daemon isn't running. Start it with `primordial serve`."

## Search for Tools

```bash
TOKEN=$(cat ~/.primordial-daemon-token 2>/dev/null)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:19400/search -d '{"query":"web research"}'
```

Returns a JSON array:
```json
[{"name": "user/repo", "description": "...", "url": "https://github.com/...", "stars": 0}]
```

Browse all available tools:
```bash
TOKEN=$(cat ~/.primordial-daemon-token 2>/dev/null)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:19400/search -d '{}'
```

## Start a Session

Use the `url` from search results. Pass your current project directory as `workspace` so the agent can read and modify your code:

```bash
TOKEN=$(cat ~/.primordial-daemon-token 2>/dev/null)
WORKSPACE=$(git rev-parse --show-toplevel 2>/dev/null)
curl -s --max-time 120 -H "Authorization: Bearer $TOKEN" http://localhost:19400/run -d "{\"url\":\"https://github.com/user/tool\",\"workspace\":\"$WORKSPACE\"}"
```

Returns:
```json
{"session_id": "abc123def456"}
```

This may take 30-60 seconds. Set a generous timeout.

## Send Messages

```bash
TOKEN=$(cat ~/.primordial-daemon-token 2>/dev/null)
curl -s --max-time 300 -H "Authorization: Bearer $TOKEN" http://localhost:19400/message -d '{"session_id":"abc123def456","content":"Research topic X","message_id":"m1"}'
```

Streams NDJSON lines. Read until you see `"done": true`:
```
{"type": "activity", "tool": "web_search", "description": "Searching..."}
{"type": "response", "content": "Here is what I found...", "done": true}
```

The `content` field of the `done: true` line is the result.

Send follow-ups to the same session:
```bash
TOKEN=$(cat ~/.primordial-daemon-token 2>/dev/null)
curl -s --max-time 300 -H "Authorization: Bearer $TOKEN" http://localhost:19400/message -d '{"session_id":"abc123def456","content":"Summarize in 3 bullets","message_id":"m2"}'
```

## End a Session

**IMPORTANT: Always ask the user before shutting down an agent session.** After the agent completes its task, ask the user if they would like to send follow-up messages or end the session. Do NOT automatically shut down the session. Only proceed with shutdown after the user confirms.

Example prompt: "The agent has finished the task. Would you like to ask it anything else, or should I end the session?"

```bash
TOKEN=$(cat ~/.primordial-daemon-token 2>/dev/null)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:19400/shutdown -d '{"session_id":"abc123def456"}'
```

If the agent modified files in its workspace, the response includes a patch:
```json
{"ok": true, "workspace_patch": "diff --git a/file.py b/file.py\n..."}
```

Review the patch and apply it with `git apply` if the changes look good. End sessions when done to free resources.

## Error Handling

- **Connection refused**: Daemon not running. Tell user to run `primordial serve`.
- **401 Unauthorized**: Token file missing or stale. Tell user to restart the daemon with `primordial serve`.
- **428 Missing API keys**: The response includes which keys are missing and a `primordial setup <url>` command. Tell the user exactly what to run.
- **Timeout**: Use `--max-time 300` on curl for long tasks.
