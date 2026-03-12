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
- [ ] Choose your SDK: **Node.js** or **CLI**
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

### Node.js SDK

Copy [`primordial_delegate.mjs`](../../packages/client/src/primordial/sandbox/primordial_delegate.mjs) into your agent's source directory. **Zero dependencies — uses built-in `net`.**

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

**Streaming variant** for real-time event processing:

```javascript
import { messageAgentStream } from './primordial_delegate.mjs';

for await (const event of messageAgentStream(sessionId, "Do research")) {
  const inner = event.event ?? {};
  if (inner.type === "activity") {
    console.log(`  [${inner.tool}] ${inner.description}`);
  } else if (inner.type === "response" && inner.done) {
    console.log(inner.content);
  }
}
```

### CLI (any language)

Copy [`delegate_cli.py`](../../packages/client/src/primordial/sandbox/delegate_cli.py) into your agent and install it as an executable. Any agent that can run shell commands can use it.

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

## Delegation Limits

The host-side DelegationHandler enforces two hard limits to prevent runaway delegation chains:

- **Max delegation depth: 3 levels total** — Agents can delegate up to 2 levels deep (3 total levels: parent → sub-agent → sub-sub-agent). The host rejects any `run` command at depth >= 3. Valid depths are 0, 1, and 2.
- **Max concurrent sub-agents per parent: 6** — A single parent agent can run at most 6 sub-agents simultaneously. Additional `run_agent` calls will fail until an existing sub-agent is stopped.

These limits apply regardless of what the agent's manifest declares. They are enforced on the host side, so a malicious agent cannot bypass them.

## Session Resumption

The `run` command accepts optional `session_id` and `session` parameters to resume a previous agent session with its state. This lets you reconnect to a sub-agent that was previously running without losing its conversation history or context.

```javascript
import { runAgent, messageAgent, stopAgent } from './primordial_delegate.mjs';

// First run — save the session info
const sessionId = await runAgent("https://github.com/owner/repo");
const result = await messageAgent(sessionId, "Start a long task");

// ... later, resume the same session
const resumedId = await runAgent("https://github.com/owner/repo", {
  sessionId,          // reconnect to this session
  session: result.session,  // restore session state
});

const followUp = await messageAgent(resumedId, "Continue where you left off");
await stopAgent(resumedId);
```

## Security

- Each sub-agent runs in its **own isolated sandbox** (Firecracker microVM)
- Sub-agent permissions come from **its own manifest**, not the parent's
- A parent cannot override or escalate a sub-agent's permissions
- API keys are resolved automatically and **scoped per-agent**
- The delegation socket only allows whitelisted commands (`search`, `run`, `message`, `monitor`, `stop`)

## API Reference

| Function | Description |
|---|---|
| `search(query)` | Search agents by capability |
| `searchAll()` | List all agents by popularity |
| `runAgent(url, {onStatus, sessionId, session})` | Spawn or resume a sub-agent |
| `messageAgent(sid, msg, {onActivity})` | Send message, get response |
| `messageAgentStream(sid, msg)` | Stream raw events |
| `monitorAgent(sid)` | View output history |
| `stopAgent(sid)` | Shut down sub-agent |
| `emitActivity(tool, desc)` | Emit progress event |
