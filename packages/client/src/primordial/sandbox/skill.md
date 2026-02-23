# Primordial Delegation Protocol

You are running inside a Primordial sandbox. If delegation is enabled in your manifest, you can spawn and interact with sub-agents by connecting to a Unix domain socket and exchanging NDJSON (newline-delimited JSON).

## Connection

Connect to the Unix socket at `/tmp/_primordial_delegate.sock`. Send one JSON object per line. Read responses line by line. All commands and responses are single-line JSON terminated by `\n`.

## Commands

### `search` — Find agents by query

**Request:**
```json
{"type": "search", "query": "web research"}
```

**Response** (single):
```json
{"type": "search_result", "agents": [{"name": "owner/repo", "description": "...", "url": "https://github.com/owner/repo", "stars": 42}]}
```

Returns up to 5 agents ranked by relevance.

### `search_all` — List all agents

**Request:**
```json
{"type": "search_all"}
```

**Response** (single): Same format as `search`. Returns up to 100 agents sorted by stars descending.

### `run` — Spawn a sub-agent (streaming)

**Request:**
```json
{"type": "run", "agent_url": "https://github.com/owner/repo"}
```

**Response** (streaming — read lines until you get `session` or `error`):

Setup progress events:
```json
{"type": "setup_status", "session_id": "deleg-1", "agent_name": "My Agent", "agent_version": "1.0.0", "status": "Spawning My Agent v1.0.0"}
```

Final ready event:
```json
{"type": "session", "session_id": "deleg-1"}
```

Save the `session_id` — you need it for all subsequent commands targeting this agent.

### `message` — Send a message to a sub-agent (streaming)

**Request:**
```json
{"type": "message", "session_id": "deleg-1", "content": "Analyze this dataset"}
```

**Response** (streaming — read lines until `"done": true`):

Activity updates (zero or more):
```json
{"type": "stream_event", "event": {"type": "activity", "tool": "bash", "description": "Running analysis..."}, "done": false}
```

Final response:
```json
{"type": "stream_event", "event": {"type": "response", "content": "Here are the results...", "message_id": "msg-abc", "done": true}, "done": true}
```

### `monitor` — View sub-agent output history

**Request:**
```json
{"type": "monitor", "session_id": "deleg-1"}
```

**Response** (single):
```json
{"type": "monitor_result", "lines": [">>> user message", "  [tool] description", "<<< response text..."]}
```

### `stop` — Shut down a sub-agent

**Request:**
```json
{"type": "stop", "session_id": "deleg-1"}
```

**Response** (single):
```json
{"type": "stopped", "session_id": "deleg-1"}
```

## Streaming vs. Single-Response

| Command | Mode | Stream ends when |
|---|---|---|
| `search` | Single | Immediately |
| `search_all` | Single | Immediately |
| `run` | Streaming | `session` or `error` received |
| `message` | Streaming | `"done": true` on outer object |
| `monitor` | Single | Immediately |
| `stop` | Single | Immediately |

For streaming commands, keep reading lines in a loop until the terminal condition. For single-response commands, read exactly one line.

## Errors

Any command can return an error:
```json
{"type": "error", "error": "Agent not in allowed_agents list"}
```

## Example Workflow

Complete Python example using only the standard library:

```python
import socket
import json


def connect():
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.connect("/tmp/_primordial_delegate.sock")
    return sock


def send(sock, obj):
    sock.sendall((json.dumps(obj) + "\n").encode())


def read_line(sock, buf=b""):
    while b"\n" not in buf:
        chunk = sock.recv(4096)
        if not chunk:
            raise ConnectionError("Socket closed")
        buf += chunk
    line, buf = buf.split(b"\n", 1)
    return json.loads(line), buf


def read_until(sock, stop_fn):
    buf = b""
    while True:
        msg, buf = read_line(sock, buf)
        yield msg
        if stop_fn(msg):
            return


sock = connect()

# Search for an agent
send(sock, {"type": "search", "query": "web research"})
result, _ = read_line(sock)
agent_url = result["agents"][0]["url"]

# Spawn it
send(sock, {"type": "run", "agent_url": agent_url})
for msg in read_until(sock, lambda m: m["type"] != "setup_status"):
    if msg["type"] == "session":
        session_id = msg["session_id"]
    elif msg["type"] == "error":
        raise RuntimeError(msg["error"])

# Send a task
send(sock, {"type": "message", "session_id": session_id, "content": "Summarize recent AI news"})
for msg in read_until(sock, lambda m: m.get("done", False)):
    if msg.get("event", {}).get("type") == "activity":
        print(f"  [{msg['event']['tool']}] {msg['event']['description']}")
    elif msg.get("done"):
        print(msg["event"]["content"])

# Clean up
send(sock, {"type": "stop", "session_id": session_id})
stopped, _ = read_line(sock)
sock.close()
```

## Emitting Activity Events

To let your parent agent see your progress in real-time, write activity events to stdout as NDJSON:

```json
{"type": "activity", "tool": "bash", "description": "Installing dependencies", "message_id": "msg-1"}
```

The `message_id` should match the message you're currently responding to. These events appear in the parent's `message` stream as `stream_event` wrappers.

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
- The commands `setup`, `keys`, `config`, and `cache` are blocked on the delegation socket.
