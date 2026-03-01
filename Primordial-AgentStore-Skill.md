# Primordial AgentStore Skill

You are an expert at building and modifying agents for the Primordial AgentStore platform. When asked to create or update an agent, follow these specifications exactly.

**Always use Node.js** — it has the fastest sandbox setup time (~0.2s with esbuild bundling vs 10+s for Python/pip).

---

## Agent Structure

Every agent needs at minimum:

```
my-agent/
├── agent.yaml          # Manifest — identity, runtime, permissions
├── package.json        # Dependencies
└── src/
    └── agent.js        # Entrypoint
```

---

## agent.yaml — The Manifest

```yaml
name: my-agent                    # 3-40 chars, lowercase + hyphens only
display_name: My Agent
version: 0.1.0
description: >
  What this agent does. Write for humans and AI callers.

category: general                 # For discovery
tags: [research, code]            # For discovery

author:
  name: Your Name
  github: your-handle

runtime:
  language: node
  run_command: node bundle.mjs 2>/dev/null || node src/agent.js
  setup_command: test -f bundle.mjs || npm install
  dependencies: package.json
  default_model:
    provider: anthropic
    model: claude-sonnet-4-5-20250929
  resources:
    max_memory: 2GB
    max_cpu: 2

keys:
  - provider: anthropic
    domain: api.anthropic.com
    auth_style: x-api-key
    required: true

permissions:
  network:
    - domain: api.anthropic.com
      reason: LLM inference
  filesystem:
    workspace: readwrite
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
| `provider` | yes | — | Lowercase name: `^[a-z][a-z0-9-]*$` |
| `domain` | yes | — | Upstream API host (FQDN, must have a dot, must have a letter) |
| `auth_style` | no | `bearer` | Header for auth. `bearer` → `Authorization: Bearer <key>`. Any other value is used as a custom header name. |
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

Domains declared in `keys` are auto-allowed. Additional domains (webhooks, etc.) must be listed here. Use `network_unrestricted: true` only if absolutely necessary.

### Validation Rules

| Field | Rule |
|-------|------|
| `name` | 3-40 chars, `^[a-z][a-z0-9-]*$` |
| `provider` | `^[a-z][a-z0-9-]*$` |
| `env_var` | `^[A-Z][A-Z0-9_]*$`, cannot be `PATH`, `HOME`, `SHELL`, etc. |
| `domain` | FQDN with at least one dot and one letter. No IP literals. |
| `auth_style` | `^[a-z][a-z0-9-]*$` |

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

```json
{"type": "message", "content": "User's question", "message_id": "msg_001"}
{"type": "shutdown"}
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

---

## Minimal Agent Template

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

---

## LLM Agent Template (with Anthropic SDK)

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

async function process(query, messageId) {
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
      const result = await process(msg.content, mid);
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

## esbuild Bundling (Recommended)

Bundle your agent into a single file to skip `npm install` entirely in the sandbox (~0.2s setup vs 10+s for pip):

```bash
npx esbuild src/agent.js --bundle --platform=node --format=esm --outfile=bundle.mjs \
  --banner:js="import{createRequire}from'module';const require=createRequire(import.meta.url);"
```

The `--banner` flag adds a `require()` shim needed for CommonJS modules in ESM bundles.

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

---

## Delegating to Other Agents

If your agent needs to call another agent:

**Manifest:**
```yaml
permissions:
  delegation:
    enabled: true
    allowed_agents:
      - owner/agent-name
```

**Code:**
```javascript
import { spawn } from "child_process";

const proc = spawn("primordial", ["run", "https://github.com/owner/repo", "--agent"], {
  stdio: ["pipe", "pipe", "inherit"],
});

// Wait for ready
for await (const line of proc.stdout) {
  const msg = JSON.parse(line.toString().trim());
  if (msg.type === "ready") break;
}

// Send task
proc.stdin.write(JSON.stringify({
  type: "message", content: "Do something", message_id: "task-1",
}) + "\n");

// Collect response
for await (const line of proc.stdout) {
  const msg = JSON.parse(line.toString().trim());
  if (msg.done) {
    const result = msg.content;
    break;
  }
}

// Shutdown
proc.stdin.write(JSON.stringify({ type: "shutdown" }) + "\n");
proc.stdin.end();
```

---

## Debugging

- Use `primordial run ./my-agent` to test locally
- Debug logs go to **stderr** (`process.stderr.write(...)`)
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

---

## Checklist for New Agents

- [ ] `agent.yaml` has `name`, `display_name`, `version`, `description`, `author`
- [ ] `run_command` uses `node bundle.mjs 2>/dev/null || node src/agent.js`
- [ ] Every API key has `provider`, `domain`, and `auth_style`
- [ ] Every outbound domain is in `permissions.network` with a `reason`
- [ ] Agent sends `{"type": "ready"}` immediately on startup
- [ ] Every message gets a response with `"done": true`
- [ ] Debug output goes to stderr, not stdout
- [ ] Persistent data goes to `workspace/`, `data/`, `output/`, or `state/`
- [ ] `bundle.mjs` committed to repo for fastest setup
