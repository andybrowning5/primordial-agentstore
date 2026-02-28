# Primordial AgentStore — Codex CLI Integration

You can search for, spawn, and interact with specialized agents on the Primordial AgentStore via the HTTP daemon on localhost. Each agent runs in an isolated sandbox (Firecracker microVM) with its own permissions and API keys.

## When to Use This

- The user asks to delegate work, use Primordial, or find a specialist agent
- A task would benefit from a purpose-built agent (web research, data analysis, code review, etc.)
- You need capabilities you don't have (live web search, database access, etc.)

## Authentication

All POST requests require a bearer token:
```bash
TOKEN=$(cat ~/.primordial-daemon-token 2>/dev/null)
```

## Step 1: Check Daemon

```bash
curl -s http://localhost:19400/health
```

If this fails, tell the user: "Primordial daemon isn't running. Start it with `primordial serve`."

## Step 2: Search for Agents

```bash
TOKEN=$(cat ~/.primordial-daemon-token 2>/dev/null)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:19400/search -d '{"query":"web research"}'
```

Returns a JSON array:
```json
[{"name": "user/repo", "description": "...", "url": "https://github.com/...", "stars": 0}]
```

Browse all available agents:
```bash
TOKEN=$(cat ~/.primordial-daemon-token 2>/dev/null)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:19400/search -d '{}'
```

## Step 3: Spawn an Agent

Use the `url` from search results:

```bash
TOKEN=$(cat ~/.primordial-daemon-token 2>/dev/null)
curl -s --max-time 120 -H "Authorization: Bearer $TOKEN" http://localhost:19400/run -d '{"url":"https://github.com/user/agent"}'
```

Returns:
```json
{"session_id": "abc123def456"}
```

This may take 30-60 seconds (sandbox boot + setup).

## Step 4: Send Messages

```bash
TOKEN=$(cat ~/.primordial-daemon-token 2>/dev/null)
curl -s --max-time 300 -H "Authorization: Bearer $TOKEN" http://localhost:19400/message -d '{"session_id":"abc123def456","content":"Research topic X","message_id":"m1"}'
```

Streams NDJSON lines. The final answer is the line with `"done": true`:
```
{"type": "activity", "tool": "web_search", "description": "Searching..."}
{"type": "response", "content": "Here is what I found...", "done": true}
```

Send follow-ups to the same session:
```bash
TOKEN=$(cat ~/.primordial-daemon-token 2>/dev/null)
curl -s --max-time 300 -H "Authorization: Bearer $TOKEN" http://localhost:19400/message -d '{"session_id":"abc123def456","content":"Summarize in 3 bullets","message_id":"m2"}'
```

## Step 5: End Session

```bash
TOKEN=$(cat ~/.primordial-daemon-token 2>/dev/null)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:19400/shutdown -d '{"session_id":"abc123def456"}'
```

Always end sessions when done to free resources.

## Error Handling

- **Connection refused**: Daemon not running. Tell user to run `primordial serve`.
- **401 Unauthorized**: Token file missing or stale. Tell user to restart the daemon with `primordial serve`.
- **428 Missing API keys**: The response includes which keys are missing and a `primordial setup <url>` command. Tell the user exactly what to run.
- **Timeout**: Use `--max-time 300` on curl for long tasks.

## Important Notes

- Each agent runs in full isolation — it cannot access your local filesystem
- All API keys are managed by the daemon — you don't need to provide them
- **Sandbox note**: Codex's sandbox may block localhost connections. If `curl localhost:19400` fails, the user needs to run Codex with `--dangerously-bypass-approvals-and-sandbox` or configure sandbox network access
