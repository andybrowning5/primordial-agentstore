# Primordial Agent Developer Skill

You are an expert at building agents for the Primordial AgentStore platform. This skill is for AI coding assistants (Claude Code, Codex, etc.) helping developers create, modify, debug, and publish Primordial agents. When asked to create or update an agent, follow these specifications exactly.

For full documentation, see the [developer docs](../README.md). This file is a self-contained reference covering everything needed to build a working agent.

**Prefer Node.js** — it has the fastest sandbox setup time (~0.2s with esbuild bundling vs 10+s for Python/pip). All languages are supported, but Node.js with esbuild is the fastest path.

---

## Agent Structure

Every agent needs at minimum:

```
my-agent/
├── agent.yaml          # Manifest — identity, runtime, permissions
└── src/
    └── agent.js        # Entrypoint (or agent.py, etc.)
```

With dependencies and bundling (recommended for Node.js):

```
my-agent/
├── agent.yaml
├── package.json
├── bundle.mjs          # esbuild bundle (committed to repo)
└── src/
    └── agent.js
```

---

## agent.yaml — The Manifest

```yaml
name: my-agent                    # 3-40 chars, lowercase + hyphens only
display_name: My Agent
version: 0.1.0
description: >
  What this agent does. Write for humans AND AI callers (other agents read this for delegation).

category: general                 # general, coding, data, writing, research, devops, security, finance, science, productivity
tags: [research, code]

author:
  name: Your Name
  github: your-handle

runtime:
  language: node                  # python, node, javascript, typescript, ruby, go, rust, java, bash, sh
  run_command: node bundle.mjs 2>/dev/null || node src/agent.js
  setup_command: test -f bundle.mjs || npm install
  dependencies: package.json
  default_provider: anthropic
  resources:
    max_memory: 2GB
    max_cpu: 2
    max_time: 30m                 # Examples: "30m", "2h", "6h"

keys:
  - provider: anthropic
    domain: api.anthropic.com
    auth_style: x-api-key
    required: true

permissions:
  network:
    - domain: api.anthropic.com
      reason: LLM inference
  network_unrestricted: false
  filesystem:
    workspace: readwrite          # "none", "readonly", or "readwrite"
  delegation:
    enabled: false
```

### Keys — API Configuration

Every API key the agent needs must be declared with `domain` and `auth_style`:

```yaml
keys:
  - provider: anthropic
    domain: api.anthropic.com
    auth_style: x-api-key
    required: true
  - provider: openai
    domain: api.openai.com
    auth_style: bearer
    required: true
  - provider: brave
    env_var: BRAVE_API_KEY
    domain: api.search.brave.com
    auth_style: x-subscription-token
    base_url_env: BRAVE_BASE_URL
    required: true
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `provider` | yes | — | Lowercase name: `^[a-z][a-z0-9-]*$` (no underscores) |
| `domain` | yes | — | Upstream API host (FQDN, must have a dot, must have a letter). |
| `auth_style` | no | `bearer` | Header for auth. One of: `bearer`, `x-api-key`, `x-subscription-token`. |
| `env_var` | no | `<PROVIDER>_API_KEY` | Env var the agent reads for the session token |
| `base_url_env` | no | `<PROVIDER>_BASE_URL` | Env var for the proxy's localhost URL. Most SDKs auto-read the default. |
| `required` | no | `true` | Whether the key must be present |

**Common auth_style values:**

| Value | Header Sent | Used By |
|-------|-------------|---------|
| `bearer` | `Authorization: Bearer <key>` | OpenAI, Google, Groq, Mistral, DeepSeek, most APIs |
| `x-api-key` | `x-api-key: <key>` | Anthropic |
| `x-subscription-token` | `X-Subscription-Token: <key>` | Brave Search |

### How the Proxy Works

The agent never sees real API keys. Primordial runs a reverse proxy inside the sandbox:

1. Agent gets `ANTHROPIC_API_KEY=sess-<random>` (session token, not real key)
2. Agent gets `ANTHROPIC_BASE_URL=http://127.0.0.1:9001` (localhost proxy)
3. Agent sends requests to localhost with the session token
4. Proxy validates the token, swaps it for the real key, forwards to the real domain over HTTPS

SDKs like `@anthropic-ai/sdk` and `openai` auto-read `*_BASE_URL` env vars, so they route through the proxy without any special code.

For manual HTTP calls (e.g., Brave Search), read the base URL env var:

```javascript
const BRAVE_BASE_URL = process.env.BRAVE_BASE_URL || "https://api.search.brave.com";
const resp = await fetch(`${BRAVE_BASE_URL}/res/v1/web/search?q=${query}`, {
  headers: { "X-Subscription-Token": process.env.BRAVE_API_KEY },
});
```

### Permissions — Network

Every outbound domain must be declared:

```yaml
permissions:
  network:
    - domain: api.anthropic.com
      reason: LLM inference
    - domain: api.search.brave.com
      reason: Web search
```

Domains declared in `keys` are auto-allowed. Additional domains (webhooks, etc.) must be listed here.

> **Note:** When `runtime.setup_command` is specified, package registries (pypi.org, registry.npmjs.org, etc.) are automatically allowed so dependency installation works. You don't need to declare them in `permissions.network`.

Use `network_unrestricted: true` only if absolutely necessary — it requires user approval.

### Validation Rules

| Field | Rule |
|-------|------|
| `name` | 3-40 chars, `^[a-z][a-z0-9-]*$` |
| `provider` | `^[a-z][a-z0-9-]*$` — no underscores |
| `env_var` | `^[A-Z][A-Z0-9_]*$` — cannot be a protected name |
| `base_url_env` | `^[A-Z][A-Z0-9_]*$` — cannot be a protected name |
| `domain` | FQDN with at least one dot and one letter. No IP literals. |
| `auth_style` | One of: `bearer`, `x-api-key`, `x-subscription-token` |

**Protected env var names** (cannot be used for `env_var` or `base_url_env`):

```
PATH, HOME, USER, SHELL, LANG, LC_ALL, LC_CTYPE, TERM, TZ,
PYTHONPATH, NODE_PATH, LD_PRELOAD, LD_LIBRARY_PATH,
DYLD_LIBRARY_PATH, DYLD_INSERT_LIBRARIES, WORKSPACE, E2B_API_KEY
```

---

## The Primordial Protocol

Agents communicate via **NDJSON over stdin/stdout**. One JSON object per line.

### Lifecycle

```
1. Agent starts
2. Agent sends {"type": "ready"} on stdout
3. Platform sends messages on stdin
4. Agent processes, sends responses on stdout
5. Platform sends {"type": "shutdown"}
6. Agent cleans up and exits
```

### Inbound Messages (stdin — platform → agent)

| Type | Fields | Description |
|------|--------|-------------|
| `message` | `content`, `message_id` | User's question or task |
| `shutdown` | — | Clean up and exit |
| `workspace_patch` | `patch`, `agent` | Sent by the CLI on shutdown when the agent modified workspace files |

```json
{"type": "message", "content": "User's question", "message_id": "msg_001"}
{"type": "shutdown"}
{"type": "workspace_patch", "patch": "diff --git a/...", "agent": "agent-name"}
```

### Outbound Messages (stdout — agent → platform)

**Ready signal** (must be first thing sent):
```json
{"type": "ready"}
```

**Response** (partial or final — every chain MUST end with `done: true`):
```json
{"type": "response", "content": "Partial answer...", "message_id": "msg_001", "done": false}
{"type": "response", "content": "Final answer.", "message_id": "msg_001", "done": true}
```

**Activity** (progress indicator shown in UI):
```json
{"type": "activity", "tool": "web_search", "description": "Searching for...", "message_id": "msg_001"}
```

**Error** (report a problem — still send a final response after):
```json
{"type": "error", "error": "Something went wrong", "message_id": "msg_001"}
```

### Critical Rules

- **stdout = protocol only.** Debug logs go to stderr.
- **Every message must get a `done: true` response.** No exceptions.
- **`message_id` must match** between request and response.
- Use `python -u` (unbuffered) or `flush=True` for Python to avoid stdout buffering.

---

## Minimal Agent Template (Node.js)

```javascript
import { createInterface } from "readline";

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function log(text) {
  process.stderr.write(text + "\n");
}

function handleMessage(content, messageId) {
  // YOUR LOGIC HERE
  return `You said: ${content}`;
}

send({ type: "ready" });
log("Agent ready");

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on("line", (line) => {
  line = line.trim();
  if (!line) return;

  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }

  if (msg.type === "shutdown") {
    log("Shutting down");
    rl.close();
    return;
  }

  if (msg.type === "message") {
    const mid = msg.message_id;
    try {
      send({ type: "activity", tool: "thinking", description: "Processing...", message_id: mid });
      const result = handleMessage(msg.content, mid);
      send({ type: "response", content: result, message_id: mid, done: true });
    } catch (e) {
      log(`Error: ${e.message}`);
      send({ type: "error", error: e.message, message_id: mid });
      send({ type: "response", content: `Error: ${e.message}`, message_id: mid, done: true });
    }
  }
});
```

## Minimal Agent Template (Python)

```python
import json
import sys

def send(msg):
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()

send({"type": "ready"})

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    msg = json.loads(line)

    if msg["type"] == "shutdown":
        break

    if msg["type"] == "message":
        mid = msg["message_id"]

        # Show progress
        send({"type": "activity", "tool": "thinking", "description": "Processing...", "message_id": mid})

        # Final response
        send({"type": "response", "content": f"You said: {msg['content']}", "message_id": mid, "done": True})
```

**Manifest for Python:**

```yaml
runtime:
  language: python
  run_command: python -u src/agent.py
  setup_command: pip install -r requirements.txt
  dependencies: requirements.txt
```

---

## LLM Agent Template (Node.js with Anthropic SDK)

Uses `@anthropic-ai/sdk` with native tool use for an agentic loop.

```javascript
import Anthropic from "@anthropic-ai/sdk";
import { createInterface } from "readline";

const client = new Anthropic();

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function log(text) {
  process.stderr.write(text + "\n");
}

const tools = [
  {
    name: "my_tool",
    description: "Describe what this tool does — the LLM reads this.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "The query" } },
      required: ["query"],
    },
  },
];

function runTool(name, input) {
  // YOUR TOOL LOGIC
  return "tool result";
}

async function handleMessage(query, messageId) {
  send({ type: "activity", tool: "thinking", description: "Thinking...", message_id: messageId });

  let messages = [{ role: "user", content: query }];

  while (true) {
    const resp = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      system: "You are a helpful agent. Use tools when needed.",
      tools,
      messages,
    });

    // Collect text and tool calls
    let text = "";
    const toolCalls = [];
    for (const block of resp.content) {
      if (block.type === "text") text += block.text;
      if (block.type === "tool_use") toolCalls.push(block);
    }

    if (resp.stop_reason !== "tool_use" || toolCalls.length === 0) {
      return text;
    }

    // Execute tools and continue the loop
    messages.push({ role: "assistant", content: resp.content });
    const toolResults = toolCalls.map((tc) => {
      send({ type: "activity", tool: tc.name, description: `Running ${tc.name}...`, message_id: messageId });
      const result = runTool(tc.name, tc.input);
      return { type: "tool_result", tool_use_id: tc.id, content: result };
    });
    messages.push({ role: "user", content: toolResults });
  }
}

send({ type: "ready" });
log("Agent ready");

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on("line", async (line) => {
  line = line.trim();
  if (!line) return;

  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }

  if (msg.type === "shutdown") {
    rl.close();
    return;
  }

  if (msg.type === "message") {
    const mid = msg.message_id;
    try {
      const result = await handleMessage(msg.content, mid);
      send({ type: "response", content: result, message_id: mid, done: true });
    } catch (e) {
      log(`Error: ${e.message}`);
      send({ type: "error", error: e.message, message_id: mid });
      send({ type: "response", content: `Error: ${e.message}`, message_id: mid, done: true });
    }
  }
});
```

**package.json:**
```json
{
  "type": "module",
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39"
  }
}
```

---

## esbuild Bundling (Recommended for Node.js)

Bundle your agent into a single file to skip `npm install` entirely in the sandbox (~0.2s setup vs 10+s for pip):

```bash
npm install --save-dev esbuild
npx esbuild src/agent.js --bundle --platform=node --format=esm --outfile=bundle.mjs \
  --banner:js="import{createRequire}from'module';const require=createRequire(import.meta.url);"
```

The `--banner` flag is required — it creates a `require()` shim so bundled CommonJS modules work in ESM format.

Add a build script to `package.json`:

```json
{
  "scripts": {
    "build": "esbuild src/agent.js --bundle --platform=node --format=esm --outfile=bundle.mjs --banner:js=\"import{createRequire}from'module';const require=createRequire(import.meta.url);\""
  }
}
```

Commit `bundle.mjs` to your repo. The manifest's `setup_command: test -f bundle.mjs || npm install` will skip the install when the bundle exists.

| Approach | Setup Time |
|----------|-----------|
| Python + pip install | 10+s |
| Node.js + npm install | 1-3s |
| Node.js + esbuild bundle | ~0.2s |

---

## Persistence

Only these directories under `/home/user/` survive between sessions:

| Directory | Use For |
|-----------|---------|
| `workspace/` | Working files, user data |
| `data/` | Cached data, databases |
| `output/` | Generated files |
| `state/` | Agent state (conversation history, config) |

Everything else (dotfiles, `.config/`, `.local/`, `.ssh/`) is wiped for security. The `agent/` directory contains your code but is not persisted — it's re-uploaded each run.

Users can maintain **multiple sessions** per agent. Each session gets its own isolated filesystem snapshot.

---

## Delegating to Other Agents

If your agent needs to call another agent, use the delegation SDK (communicates via Unix socket inside the sandbox).

### Manifest

```yaml
permissions:
  delegation:
    enabled: true
    allowed_agents:          # optional — omit to allow all agents
      - https://github.com/owner/agent-a
      - https://github.com/owner/agent-b
```

### Node.js SDK

Copy `primordial_delegate.mjs` into your source directory. **Zero dependencies — uses built-in `net`.**

```javascript
import { search, runAgent, messageAgent, stopAgent, emitActivity } from './primordial_delegate.mjs';

// Find an agent
const agents = await search("web research");

// Spawn it
const sessionId = await runAgent(agents[0].url, {
  onStatus: (e) => emitActivity("sub:setup", e.status),
});

// Send a task
const result = await messageAgent(sessionId, "Research topic X", {
  onActivity: (tool, desc) => emitActivity(`sub:${tool}`, desc),
});
console.log(result.response);

// Clean up
await stopAgent(sessionId);
```

### Python SDK

Copy `primordial_delegate.py` into your source directory. **Stdlib-only — no dependencies.**

```python
from primordial_delegate import search, run_agent, message_agent, stop_agent, emit_activity

# Find an agent
agents = search("web research")
agent_url = agents[0]["url"]

# Spawn it
def on_status(event):
    emit_activity("sub:setup", event.get("status", ""))

session_id = run_agent(agent_url, on_status=on_status)

# Send a task
def on_activity(tool, description):
    emit_activity(f"sub:{tool}", description)

result = message_agent(session_id, "Research topic X", on_activity=on_activity)
print(result["response"])

# Clean up
stop_agent(session_id)
```

### CLI (any language)

Copy `delegate_cli.py` into your agent and install it as an executable. Any agent that can run shell commands can use it.

```bash
# Search for agents
delegate search "web research"

# Spawn (prints session_id to stdout, progress to stderr)
SESSION_ID=$(delegate run https://github.com/owner/repo)

# Send a message (response to stdout, activity to stderr)
delegate message $SESSION_ID "Research topic X"

# Clean up
delegate stop $SESSION_ID
```

### Delegation Limits (enforced host-side, cannot be overridden)

- **Max delegation depth: 3** — agents can delegate up to 3 levels deep
- **Max concurrent sub-agents per parent: 6**

See [Delegation docs](delegation.md) for the streaming API and full reference.

---

## Wrapping CLI Tools

Any CLI tool becomes an agent with a thin bridge:

```python
import json, subprocess, sys

def send(msg):
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()

send({"type": "ready"})

for line in sys.stdin:
    msg = json.loads(line.strip())
    if msg["type"] == "shutdown":
        break
    if msg["type"] == "message":
        result = subprocess.run(
            ["some-cli-tool", "--message", msg["content"]],
            capture_output=True, text=True, timeout=280,
        )
        send({"type": "response", "content": result.stdout.strip(),
              "message_id": msg["message_id"], "done": True})
```

---

## Debugging

- Use `primordial run ./my-agent` to test locally
- Debug logs go to **stderr** (`process.stderr.write(...)` or `sys.stderr.write(...)`)
- Send `activity` messages so the UI shows progress

**Common issues:**

| Symptom | Fix |
|---------|-----|
| Agent never becomes ready | Send `{"type": "ready"}` before reading stdin |
| No response appears | Missing `"done": true` on final response |
| State lost between sessions | Write to `workspace/`, `data/`, `output/`, or `state/` |
| Module not found | Check `setup_command` installs dependencies |
| SSL/connection errors | Declare domain in `permissions.network` |
| esbuild "Dynamic require" error | Add the `--banner:js` createRequire shim |
| stdout buffering (Python) | Use `python -u` in `run_command` or `flush=True` |

---

## Publishing

1. Create a **public GitHub repo** with your agent code
2. Add `agent.yaml` at the repo root
3. Add the `primordial-agent` topic to the repo (Settings → Topics, or `gh repo edit --add-topic primordial-agent`)
4. Write a good README (what it does, required API keys, usage command, example conversation)
5. Test locally: `primordial run ./my-agent`
6. Test from URL: `primordial run https://github.com/you/my-agent`
7. Verify discovery: `primordial search`

> **Testing topic:** Use `primordial-agent-test` instead during development. Primordial indexes both topics, so your agent will appear in search results without polluting the production listing. Switch to `primordial-agent` when you're ready to publish.

See [Publishing docs](publishing.md) for the full developer checklist.

---

## Checklist for New Agents

### Manifest
- [ ] `agent.yaml` has `name`, `display_name`, `version`, `description`, `author`
- [ ] `name` — lowercase + hyphens only, 3-40 chars, matches `^[a-z][a-z0-9-]*$`
- [ ] `description` — clear and informative (written for humans AND AI callers)

### Runtime
- [ ] `run_command` set — uses `node bundle.mjs 2>/dev/null || node src/agent.js` for Node.js, `python -u src/agent.py` for Python
- [ ] `setup_command` installs all dependencies
- [ ] `bundle.mjs` committed to repo for fastest setup (Node.js)

### API Keys
- [ ] Every API key has `provider`, `domain`, and `auth_style`
- [ ] Agent code reads `<PROVIDER>_BASE_URL` env var for all HTTP calls (required for proxy routing)

### Permissions
- [ ] Every outbound domain is in `permissions.network` with a `reason`
- [ ] `filesystem.workspace` set to minimum needed (`readonly` if possible)

### Protocol Compliance
- [ ] Agent sends `{"type": "ready"}` immediately on startup
- [ ] Every message gets a response with matching `message_id` and `done: true`
- [ ] Agent handles `{"type": "shutdown"}` gracefully
- [ ] All debug output goes to stderr, not stdout

### Persistence
- [ ] Persistent data goes to `workspace/`, `data/`, `output/`, or `state/`
- [ ] No reliance on dotfiles or `/tmp/` (wiped between sessions)

### Testing
- [ ] `primordial run ./my-agent` passes locally
- [ ] `primordial run https://github.com/you/my-agent` passes from URL
- [ ] Fresh session test: `primordial cache clear --all` then run again
