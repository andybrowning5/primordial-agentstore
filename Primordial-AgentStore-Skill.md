# Primordial AgentStore Skill

You are an expert at building and modifying agents for the Primordial AgentStore platform. When asked to create or update an agent, follow these specifications exactly.

---

## Agent Structure

Every agent needs at minimum:

```
my-agent/
├── agent.yaml          # Manifest — identity, runtime, permissions
├── requirements.txt    # Dependencies (if Python)
└── src/
    └── agent.py        # Entrypoint
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
  language: python                       # Or "node" — see Node.js note below
  run_command: python -u src/agent.py    # -u for unbuffered stdout
  setup_command: pip install -r requirements.txt
  dependencies: requirements.txt
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

SDKs like `ChatAnthropic` and `openai.OpenAI()` auto-read `*_BASE_URL` env vars, so they route through the proxy without any special code.

For manual HTTP calls (e.g., Brave Search), read the base URL env var:

```python
BRAVE_BASE_URL = os.environ.get("BRAVE_BASE_URL", "https://api.search.brave.com")
resp = httpx.get(f"{BRAVE_BASE_URL}/res/v1/web/search", ...)
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
- **Always use `python -u`** or `sys.stdout.flush()` — buffered stdout breaks the protocol.
- **Every message must get a `done: true` response.** No exceptions.
- **`message_id` must match** between request and response.

---

## Minimal Python Agent Template

```python
"""Minimal Primordial agent."""
import json
import sys


def send(msg: dict) -> None:
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def log(text: str) -> None:
    print(text, file=sys.stderr, flush=True)


def handle_message(content: str, message_id: str) -> str:
    """Process a user message and return the response text."""
    # YOUR LOGIC HERE
    return f"You said: {content}"


def main():
    send({"type": "ready"})
    log("Agent ready")

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue

        if msg["type"] == "shutdown":
            log("Shutting down")
            break

        if msg["type"] == "message":
            mid = msg["message_id"]
            try:
                send({"type": "activity", "tool": "thinking",
                      "description": "Processing...", "message_id": mid})
                result = handle_message(msg["content"], mid)
                send({"type": "response", "content": result,
                      "message_id": mid, "done": True})
            except Exception as e:
                log(f"Error: {e}")
                send({"type": "error", "error": str(e), "message_id": mid})
                send({"type": "response", "content": f"Error: {e}",
                      "message_id": mid, "done": True})


if __name__ == "__main__":
    main()
```

---

## LLM Agent Template (with Deep Agents)

Uses [LangChain Deep Agents](https://github.com/langchain-ai/deepagents) — an agent harness with built-in planning, filesystem, and sub-agent spawning.

```python
"""Primordial agent using LangChain Deep Agents."""
import json
import sys

from deepagents import create_deep_agent
from langchain.chat_models import init_chat_model
from langchain_core.tools import tool


def send(msg: dict) -> None:
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def log(text: str) -> None:
    print(text, file=sys.stderr, flush=True)


@tool
def my_tool(query: str) -> str:
    """Describe what this tool does — the LLM reads this docstring."""
    # YOUR TOOL LOGIC
    return "tool result"


def process(query: str, message_id: str) -> str:
    send({"type": "activity", "tool": "thinking",
          "description": "Thinking...", "message_id": message_id})

    agent = create_deep_agent(
        model=init_chat_model("anthropic:claude-sonnet-4-5-20250929"),
        tools=[my_tool],
        system_prompt="You are a helpful agent. Use tools when needed.",
    )

    result = agent.invoke(
        {"messages": [{"role": "user", "content": query}]}
    )

    # Extract the final AI response
    for msg in reversed(result.get("messages", [])):
        if getattr(msg, "type", None) == "ai" and getattr(msg, "content", None):
            content = msg.content
            if isinstance(content, list):
                return "\n".join(
                    block if isinstance(block, str) else block.get("text", "")
                    for block in content
                )
            return content
    return ""


def main():
    send({"type": "ready"})
    log("Agent ready")

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue

        if msg["type"] == "shutdown":
            break

        if msg["type"] == "message":
            mid = msg["message_id"]
            try:
                result = process(msg["content"], mid)
                send({"type": "response", "content": result,
                      "message_id": mid, "done": True})
            except Exception as e:
                log(f"Error: {e}")
                send({"type": "error", "error": str(e), "message_id": mid})
                send({"type": "response", "content": f"Error: {e}",
                      "message_id": mid, "done": True})


if __name__ == "__main__":
    main()
```

**requirements.txt for Deep Agents:**
```
deepagents>=0.2
langchain>=0.3
langchain-anthropic>=0.3
httpx>=0.27
```

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
```python
import subprocess, json

proc = subprocess.Popen(
    ["primordial", "run", "https://github.com/owner/repo", "--agent"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True,
)

# The --agent flag still shows the interactive session picker and
# permissions approval prompt on stdout/stdin (the host agent
# participates just like a human). After approval, it switches to
# NDJSON mode.

# Wait for ready
for line in proc.stdout:
    msg = json.loads(line.strip())
    if msg["type"] == "ready":
        break

# Send task
proc.stdin.write(json.dumps({
    "type": "message", "content": "Do something",
    "message_id": "task-1",
}) + "\n")
proc.stdin.flush()

# Collect response
for line in proc.stdout:
    msg = json.loads(line.strip())
    if msg.get("done"):
        result = msg["content"]
        break

# Shutdown
proc.stdin.write(json.dumps({"type": "shutdown"}) + "\n")
proc.stdin.flush()
proc.wait()
```

---

## Debugging

- Use `primordial run ./my-agent` to test locally
- Debug logs go to **stderr** (`print(..., file=sys.stderr)`)
- Always use `python -u` in `run_command` to prevent stdout buffering
- Send `activity` messages so the UI shows progress

**Common issues:**

| Symptom | Fix |
|---------|-----|
| Agent never becomes ready | Send `{"type": "ready"}` before reading stdin |
| No response appears | Missing `"done": true` on final response |
| State lost between sessions | Write to `workspace/`, `data/`, `output/`, or `state/` |
| Import errors | Check `setup_command` installs dependencies |
| SSL/connection errors | Declare domain in `permissions.network` |

---

## Node.js Agents (Fastest Setup)

All languages are supported, but Node.js with esbuild bundling gives the fastest sandbox setup (~0.2s vs 3-5s for Python/pip).

**Node.js manifest:**

```yaml
runtime:
  language: node
  run_command: node bundle.mjs 2>/dev/null || node src/agent.js
  setup_command: test -f bundle.mjs || npm install
  dependencies: package.json
```

**esbuild bundling** — bundle your agent into a single file to skip `npm install`:

```bash
npx esbuild src/agent.js --bundle --platform=node --format=esm --outfile=bundle.mjs \
  --banner:js="import{createRequire}from'module';const require=createRequire(import.meta.url);"
```

Commit `bundle.mjs` to your repo. The `--banner` flag adds a `require()` shim needed for CommonJS modules in ESM bundles.

| Approach | Setup Time |
|----------|-----------|
| Python + pip install | 3-5s |
| Node.js + npm install | 1-3s |
| Node.js + esbuild bundle | ~0.2s |

---

## Checklist for New Agents

- [ ] `agent.yaml` has `name`, `display_name`, `version`, `description`, `author`
- [ ] `run_command` uses `python -u` (or equivalent unbuffered output)
- [ ] Every API key has `provider`, `domain`, and `auth_style`
- [ ] Every outbound domain is in `permissions.network` with a `reason`
- [ ] Agent sends `{"type": "ready"}` immediately on startup
- [ ] Every message gets a response with `"done": true`
- [ ] Debug output goes to stderr, not stdout
- [ ] Persistent data goes to `workspace/`, `data/`, `output/`, or `state/`
