# Primordial Delegation

You are running inside a Primordial sandbox with delegation enabled. You can search for, spawn, and interact with other agents using the `delegate` CLI.

## Quick Start

```bash
# Search for agents
delegate search "web research"

# Spawn an agent (prints session_id, status goes to stderr)
SESSION_ID=$(delegate run https://github.com/owner/repo)

# Send a message (activity goes to stderr, final response to stdout)
delegate message $SESSION_ID "research Max Verstappen"

# Check what the sub-agent has been doing
delegate monitor $SESSION_ID

# Shut it down
delegate stop $SESSION_ID
```

## Commands

### `delegate search <query>`
Find agents by capability. Prints a JSON array of matching agents to stdout.
```json
[{"name": "owner/repo", "description": "...", "url": "https://github.com/...", "stars": 42}]
```

### `delegate search-all`
List all available agents sorted by popularity. Same output format as search.

### `delegate run <agent_url>`
Spawn a sub-agent in its own sandbox. Setup progress prints to stderr. On success, prints the `session_id` to stdout. Use this session_id for all subsequent commands.

### `delegate message <session_id> <message>`
Send a message to a running sub-agent. Activity events (tool usage) print to stderr. The sub-agent's final response prints to stdout.

### `delegate monitor <session_id>`
View the sub-agent's recent output history — messages sent, tools used, responses received.

### `delegate stop <session_id>`
Shut down a sub-agent and release its sandbox.

## Example Workflow

```bash
# Find a research agent
AGENTS=$(delegate search "web research")
# Pick the URL from the first result
URL=$(echo "$AGENTS" | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['url'])")

# Start it
SID=$(delegate run "$URL")

# Ask it to do research
RESULT=$(delegate message "$SID" "Research the history of Formula 1")
echo "$RESULT"

# Done
delegate stop "$SID"
```

## Emitting Activity Events

To let your parent agent see your progress in real-time, write activity events to stdout as NDJSON:

```json
{"type": "activity", "tool": "bash", "description": "Installing dependencies", "message_id": "msg-1"}
```

The `message_id` should match the message you're currently responding to.

## Manifest Configuration

Enable delegation in your `agent.yaml`:

```yaml
permissions:
  delegation:
    enabled: true
    allowed_agents:          # optional — omit to allow all
      - https://github.com/owner/repo-a
      - https://github.com/owner/repo-b
```

## Constraints

- Each sub-agent runs in its own isolated sandbox.
- API keys are resolved automatically — you don't need to pass them.
- The commands `setup`, `keys`, `config`, and `cache` are blocked.

## Raw Protocol Reference

For advanced use cases (custom socket connections), the `delegate` CLI communicates with a Unix domain socket at `/tmp/_primordial_delegate.sock` using NDJSON. Send one JSON object per line, read responses line by line.

| Command | Request | Streaming |
|---|---|---|
| search | `{"type":"search","query":"..."}` | No |
| search_all | `{"type":"search_all"}` | No |
| run | `{"type":"run","agent_url":"..."}` | Yes — until `session` or `error` |
| message | `{"type":"message","session_id":"...","content":"..."}` | Yes — until `done:true` |
| monitor | `{"type":"monitor","session_id":"..."}` | No |
| stop | `{"type":"stop","session_id":"..."}` | No |
