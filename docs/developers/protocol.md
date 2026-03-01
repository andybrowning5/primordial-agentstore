# The Primordial Protocol

The Primordial Protocol is how agents communicate with the platform. It's **NDJSON** (Newline-Delimited JSON) over stdin/stdout — one JSON object per line.

## How It Works

Your agent is a process that passes messages back and forth through stdin/stdout:

```
┌─────────────────┐                    ┌─────────────────┐
│   AgentStore     │   stdin (notes →)  │    Your Agent    │
│   (the platform) │ ──────────────── → │    (your code)   │
│                  │   stdout (← notes) │                  │
│                  │ ← ──────────────── │                  │
└─────────────────┘                    └─────────────────┘
```

- **stdin** = the platform writes to your agent (user messages, shutdown signals)
- **stdout** = your agent writes back (responses, progress updates)
- **stderr** = debug logs (not part of the protocol — print freely here)

## Full Conversation Example

```
                                          Agent starts, does setup work
Agent → stdout:  {"type": "ready"}                                        ← "I'm alive"

                                          User types "Prioritize my tasks"

Platform → stdin: {"type": "message", "content": "Prioritize my tasks", "message_id": "msg_001"}

                                          Agent reads, thinks...

Agent → stdout:  {"type": "activity", "tool": "thinking", "description": "Analyzing..."}
                                                                          ← progress (optional)

Agent → stdout:  {"type": "response", "content": "1. Ship feature...", "message_id": "msg_001", "done": true}
                                                                          ← the answer

                                          User types again... (cycle repeats)

Platform → stdin: {"type": "shutdown"}                                    ← "time to exit"
                                          Agent cleans up and exits.
```

## Lifecycle

1. Agent starts → prints `{"type": "ready"}` to stdout
2. Platform sends user messages on stdin
3. Agent processes each message, writes responses to stdout
4. On `{"type": "shutdown"}`, agent cleans up and exits

## Message Types

### Inbound (stdin — platform → agent)

| Type | Fields | Description |
|------|--------|-------------|
| `message` | `content`, `message_id` | User's question or task |
| `shutdown` | — | Clean up and exit |

```json
{"type": "message", "content": "User's question", "message_id": "msg_001"}
{"type": "shutdown"}
```

### Outbound (stdout — agent → platform)

| Type | Fields | Description |
|------|--------|-------------|
| `ready` | — | Agent is initialized and ready for messages |
| `response` | `content`, `message_id`, `done` | Answer (partial or final) |
| `activity` | `tool`, `description`, `message_id` | Progress indicator shown in UI |
| `error` | `error`, `message_id` | Error report |

```json
{"type": "ready"}
{"type": "response", "content": "Answer text", "message_id": "msg_001", "done": true}
{"type": "response", "content": "Partial...", "message_id": "msg_001", "done": false}
{"type": "activity", "tool": "web_search", "description": "Searching...", "message_id": "msg_001"}
{"type": "error", "error": "Something went wrong", "message_id": "msg_001"}
```

## Rules

- Every message response chain must end with `{"type": "response", ..., "done": true}`
- Use `activity` messages to show progress (tool usage, loading indicators)
- Print debug logs to **stderr** — stdout is reserved for the protocol
- Use `python -u` (unbuffered) or `flush=True` to avoid stdout buffering
- The `message_id` ties responses back to the question that prompted them

## Language Agnostic

Any language that reads stdin and writes stdout works. There's no HTTP, no sockets, no framework. Python, Node.js, Rust, Go, bash — all work.
