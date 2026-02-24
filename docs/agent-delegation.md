# Agent Delegation

Agents can discover, spawn, and interact with other agents on the Primordial AgentStore. Each sub-agent runs in its own isolated sandbox with its own permissions and API keys.

## How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│  HOST MACHINE                                                       │
│                                                                     │
│  ┌──────────────┐         ┌──────────────────────────────────────┐  │
│  │  Key Vault   │         │  Primordial Client (host process)    │  │
│  │ (encrypted)  │         │                                      │  │
│  │              │         │  • Resolves API keys from vault       │  │
│  │  anthropic ──┼────────▶│  • Manages sandbox lifecycles         │  │
│  │  openai   ──┼────────▶│  • Routes NDJSON between sandboxes    │  │
│  │  e2b      ──┼────────▶│  • Handles search (GitHub + FastEmbed)│  │
│  │  ...        │         │                                      │  │
│  └──────────────┘         └──────┬──────────────┬────────────────┘  │
│                                  │              │                    │
│                    ┌─────────────┘              └──────────┐        │
│                    ▼                                       ▼        │
│  ┌─────────────────────────────────┐ ┌─────────────────────────────┐│
│  │  SANDBOX A (Firecracker microVM)│ │ SANDBOX B (Firecracker)     ││
│  │  Parent Agent                   │ │ Sub-Agent                   ││
│  │                                 │ │                             ││
│  │  ┌───────────────────────────┐  │ │ ┌─────────────────────────┐ ││
│  │  │ Agent Process (user)      │  │ │ │ Agent Process (user)    │ ││
│  │  │                           │  │ │ │                         │ ││
│  │  │ SDK calls ──────┐        │  │ │ │ API calls ──────┐      │ ││
│  │  │                 ▼        │  │ │ │                 ▼      │ ││
│  │  │  ┌─────────────────────┐ │  │ │ │  ┌──────────────────┐  │ ││
│  │  │  │ Unix Socket         │ │  │ │ │  │ localhost:9001   │  │ ││
│  │  │  │ /tmp/_primordial_   │ │  │ │ │  │ (proxy endpoint) │  │ ││
│  │  │  │ delegate.sock       │ │  │ │ │  └────────┬─────────┘  │ ││
│  │  │  └──────────┬──────────┘ │  │ │ │           │            │ ││
│  │  └─────────────┼────────────┘  │ │ └───────────┼────────────┘ ││
│  │                ▼               │ │             ▼              ││
│  │  ┌───────────────────────────┐ │ │ ┌─────────────────────────┐││
│  │  │ Delegation Proxy (root)   │ │ │ │ API Key Proxy (root)    │││
│  │  │                           │ │ │ │                         │││
│  │  │ • Validates commands      │ │ │ │ • Injects real API key  │││
│  │  │ • Allowlist: search, run, │ │ │ │ • Forwards to real API  │││
│  │  │   message, monitor, stop  │ │ │ │ • Strips key from resp  │││
│  │  │ • Relays NDJSON to host   │ │ │ │ • Validates session tok │││
│  │  └──────────┬────────────────┘ │ │ └────────────┬────────────┘││
│  │             │ stdin/stdout      │ │              │ HTTPS       ││
│  └─────────────┼──────────────────┘ └──────────────┼─────────────┘│
│                │                                   │              │
│                ▼                                   ▼              │
│         Host Delegation                     api.anthropic.com     │
│         Handler (routes                     api.openai.com        │
│         commands to                         etc.                  │
│         Sandbox B)                                                │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Concepts

**Sandbox isolation:** Every agent (parent and sub-agent) runs in its own Firecracker microVM. They cannot access each other's filesystems, processes, or memory.

**API key security:** Real API keys never enter the sandbox. The host resolves keys from the encrypted vault and passes them to a root-owned proxy process inside the sandbox. The agent process (running as `user`) talks to `localhost:9001` and sends a session token instead of a real key. The proxy swaps in the real key and forwards the request over HTTPS. Linux `hidepid=2` prevents the agent from reading the proxy's `/proc` entries.

**Delegation flow:**
1. Parent agent calls `run_agent("https://github.com/owner/repo")` via the SDK
2. SDK connects to the Unix socket → delegation proxy (root) → host process via stdin/stdout
3. Host process spins up a **new sandbox** for the sub-agent with its own manifest, permissions, and API key proxy
4. Parent sends messages to the sub-agent through the same socket relay chain
5. Sub-agent's responses stream back: sub-agent → its sandbox stdout → host → parent's delegation proxy → parent's Unix socket → parent's SDK

**API key resolution for sub-agents:** When the host spawns a sub-agent sandbox, it reads the sub-agent's `agent.yaml` to determine which API keys it needs, resolves them from the user's key vault, and configures a fresh API key proxy inside the sub-agent's sandbox. The parent agent never sees the sub-agent's keys.

## Setup Checklist

- [ ] Add `permissions.delegation.enabled: true` to your `agent.yaml`
- [ ] Choose your SDK: **Python**, **Node.js**, or **CLI**
- [ ] Copy the SDK file into your agent's source directory
- [ ] Wire up delegation tools in your agent (see examples below)
- [ ] Test with `primordial run <your-agent>`

## 1. Enable Delegation in Your Manifest

```yaml
permissions:
  delegation:
    enabled: true
    allowed_agents:          # optional — omit to allow all agents
      - https://github.com/owner/agent-a
      - https://github.com/owner/agent-b
```

## 2. Choose Your SDK

### Python SDK

Copy [`primordial_delegate.py`](../packages/client/src/primordial/sandbox/primordial_delegate.py) into your agent's source directory. **Stdlib-only — no dependencies.**

```python
from primordial_delegate import (
    search,          # Search for agents by capability
    search_all,      # List all agents
    run_agent,       # Spawn a sub-agent, get session_id
    message_agent,   # Send message, get response
    stop_agent,      # Shut down a sub-agent
    monitor_agent,   # View sub-agent output history
    emit_activity,   # Forward progress to parent TUI
)
```

**Full example:**

```python
from primordial_delegate import search, run_agent, message_agent, stop_agent, emit_activity

# Find an agent
agents = search("web research")
agent_url = agents[0]["url"]

# Spawn it (on_status callback for setup progress)
def on_status(event):
    emit_activity("sub:setup", event.get("status", ""))

session_id = run_agent(agent_url, on_status=on_status)

# Send a task (on_activity callback for tool usage)
def on_activity(tool, description):
    emit_activity(f"sub:{tool}", description)

result = message_agent(session_id, "Research Max Verstappen", on_activity=on_activity)
print(result["response"])       # Final response text
print(result["activities"])     # List of tools the sub-agent used

# Clean up
stop_agent(session_id)
```

**Streaming variant** for real-time event processing:

```python
from primordial_delegate import message_agent_stream

for event in message_agent_stream(session_id, "Do research"):
    inner = event.get("event", {})
    if inner.get("type") == "activity":
        print(f"  [{inner['tool']}] {inner['description']}")
    elif inner.get("type") == "response" and inner.get("done"):
        print(inner["content"])
```

### Node.js SDK

Copy [`primordial_delegate.mjs`](../packages/client/src/primordial/sandbox/primordial_delegate.mjs) into your agent's source directory. **Zero dependencies — uses built-in `net`.**

```javascript
import {
  search,          // Search for agents by capability
  searchAll,       // List all agents
  runAgent,        // Spawn a sub-agent, get sessionId
  messageAgent,    // Send message, get response
  stopAgent,       // Shut down a sub-agent
  monitorAgent,    // View sub-agent output history
  emitActivity,    // Forward progress to parent TUI
} from './primordial_delegate.mjs';
```

**Full example:**

```javascript
import { search, runAgent, messageAgent, stopAgent, emitActivity } from './primordial_delegate.mjs';

// Find an agent
const agents = await search("web research");

// Spawn it
const sessionId = await runAgent(agents[0].url, {
  onStatus: (e) => emitActivity("sub:setup", e.status),
});

// Send a task
const result = await messageAgent(sessionId, "Research Max Verstappen", {
  onActivity: (tool, desc) => emitActivity(`sub:${tool}`, desc),
});
console.log(result.response);

// Clean up
await stopAgent(sessionId);
```

### CLI (any language)

Copy [`delegate_cli.py`](../packages/client/src/primordial/sandbox/delegate_cli.py) into your agent and install it as an executable. Any agent that can run shell commands can use it.

```bash
# Search for agents
delegate search "web research"

# Spawn (prints session_id to stdout, progress to stderr)
SESSION_ID=$(delegate run https://github.com/owner/repo)

# Send a message (response to stdout, activity to stderr)
delegate message $SESSION_ID "Research Max Verstappen"

# Clean up
delegate stop $SESSION_ID
```

## 3. Forward Activity Events

To show sub-agent progress in the parent TUI in real-time, emit activity events to stdout as NDJSON:

```json
{"type": "activity", "tool": "sub:search", "description": "searching the web...", "message_id": "msg-1"}
```

Both SDKs include `emit_activity()` / `emitActivity()` helpers. The `message_id` should match the message you're currently responding to.

## Security

- Each sub-agent runs in its **own isolated sandbox** (Firecracker microVM)
- Sub-agent permissions come from **its own manifest**, not the parent's
- A parent cannot override or escalate a sub-agent's permissions
- API keys are resolved automatically and **scoped per-agent**
- The delegation socket only allows whitelisted commands (`search`, `run`, `message`, `monitor`, `stop`)

## API Reference

| Function (Python) | Function (Node) | Description |
|---|---|---|
| `search(query)` | `search(query)` | Search agents by capability |
| `search_all()` | `searchAll()` | List all agents by popularity |
| `run_agent(url, on_status=)` | `runAgent(url, {onStatus})` | Spawn a sub-agent |
| `message_agent(sid, msg, on_activity=)` | `messageAgent(sid, msg, {onActivity})` | Send message, get response |
| `message_agent_stream(sid, msg)` | `messageAgentStream(sid, msg)` | Stream raw events |
| `monitor_agent(sid)` | `monitorAgent(sid)` | View output history |
| `stop_agent(sid)` | `stopAgent(sid)` | Shut down sub-agent |
| `emit_activity(tool, desc)` | `emitActivity(tool, desc)` | Emit progress event |
