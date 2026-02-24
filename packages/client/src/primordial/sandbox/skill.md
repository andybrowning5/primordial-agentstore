# Primordial Delegation

Agents can search for, spawn, and interact with other agents on the Primordial AgentStore. When delegation is enabled, a Unix socket at `/tmp/_primordial_delegate.sock` is available for agent-to-agent communication.

## SDKs

### Python

Copy `primordial_delegate.py` into your agent. Stdlib-only, no dependencies.

```python
from primordial_delegate import search, run_agent, message_agent, stop_agent

# Find an agent
agents = search("web research")
agent_url = agents[0]["url"]

# Spawn it
session_id = run_agent(agent_url, on_status=lambda e: print(e["status"]))

# Send a task
result = message_agent(session_id, "Research recent AI breakthroughs")
print(result["response"])

# Clean up
stop_agent(session_id)
```

**Streaming variant:**
```python
from primordial_delegate import message_agent_stream

for event in message_agent_stream(session_id, "Do research"):
    inner = event.get("event", {})
    if inner.get("type") == "activity":
        print(f"  [{inner['tool']}] {inner['description']}")
    elif inner.get("type") == "response" and inner.get("done"):
        print(inner["content"])
```

### Node.js

Copy `primordial_delegate.mjs` into your agent. Zero dependencies, uses built-in `net`.

```javascript
import { search, runAgent, messageAgent, stopAgent } from './primordial_delegate.mjs';

const agents = await search("web research");
const sessionId = await runAgent(agents[0].url, {
  onStatus: (e) => console.log(e.status),
});

const result = await messageAgent(sessionId, "Research recent AI breakthroughs", {
  onActivity: (tool, desc) => console.log(`  [${tool}] ${desc}`),
});
console.log(result.response);

await stopAgent(sessionId);
```

### CLI (any language)

The `delegate` CLI can be included in your agent for shell-based delegation.

```bash
delegate search "web research"
SESSION_ID=$(delegate run https://github.com/owner/repo)
delegate message $SESSION_ID "Research recent AI breakthroughs"
delegate stop $SESSION_ID
```

## Activity Events

To let the parent agent / TUI see sub-agent progress in real-time, emit activity events to stdout:

```json
{"type": "activity", "tool": "sub:search", "description": "searching the web...", "message_id": "msg-1"}
```

Both SDKs include an `emit_activity()` helper for this.

## Manifest Configuration

Enable delegation in your `agent.yaml`:

```yaml
permissions:
  delegation:
    enabled: true
    allowed_agents:          # optional — omit to allow all
      - https://github.com/owner/repo-a
```

## Raw Protocol Reference

For custom implementations in other languages, connect to `/tmp/_primordial_delegate.sock` and exchange NDJSON:

| Command | Request | Streaming |
|---|---|---|
| search | `{"type":"search","query":"..."}` | No |
| search_all | `{"type":"search_all"}` | No |
| run | `{"type":"run","agent_url":"..."}` | Yes — until `session` or `error` |
| message | `{"type":"message","session_id":"...","content":"..."}` | Yes — until `done:true` |
| monitor | `{"type":"monitor","session_id":"..."}` | No |
| stop | `{"type":"stop","session_id":"..."}` | No |

## Constraints

- Each sub-agent runs in its own isolated sandbox.
- API keys are resolved automatically — you don't need to pass them.
- The commands `setup`, `keys`, `config`, and `cache` are blocked.
