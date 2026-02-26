# Primordial AgentStore — Host Agent Integration

You can search for, spawn, and interact with specialized agents on the Primordial AgentStore. Each agent runs in an isolated sandbox (Firecracker microVM) with its own permissions and API keys.

## Setup

If `primordial` is not installed, install it:

```bash
pip install primordial-agentstore
```

### Daemon Mode (Recommended)

The Primordial daemon holds vault keys in memory and serves actions over a local Unix socket. Host agents delegate through the daemon automatically — they never access the vault or API keys directly.

**macOS auto-start (launchd):**

Create `~/Library/LaunchAgents/com.primordial.daemon.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.primordial.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>/path/to/primordial</string>
        <string>serve</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/primordial-daemon.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/primordial-daemon.err.log</string>
</dict>
</plist>
```

Then load it: `launchctl load ~/Library/LaunchAgents/com.primordial.daemon.plist`

**Or start manually:** `primordial serve`

### Per-agent setup

- **Claude Code:** Copy this file to `~/.claude/skills/primordial/skill.md`
- **Codex CLI:** Append this file to `~/.codex/AGENTS.md` (global) or `./AGENTS.md` (per-project)
- **OpenClaw:** Copy this file to `~/.openclaw/workspace/skills/primordial/SKILL.md`

## When to Use This

- The user asks to delegate work, use Primordial, or find a specialist agent
- A task would benefit from a purpose-built agent (web research, data analysis, code review, etc.)
- You need capabilities you don't have (live web search, database access, etc.)

## Step 1: Always Search First

**Before spawning any agent, search the marketplace to find the right one.** Do not guess agent URLs or names — always discover them via search.

```bash
primordial search --agent
primordial search "web research" --agent
```

Returns a JSON array:
```json
[{"name": "user/repo", "description": "...", "url": "https://github.com/...", "stars": 0}]
```

**Pick the best match** by reading the `description` field. Use the `url` field as the agent URL in the next step.

## Step 2: Spawn and Interact

When the daemon is running, `primordial run --agent` delegates through it automatically. **No interactive setup prompts** — the daemon handles sessions, keys, and permissions.

### Single-message pattern (simplest)

```bash
printf '{"type":"message","content":"YOUR TASK HERE","message_id":"msg_0001"}\n{"type":"shutdown"}\n' \
  | primordial run <agent-url> --agent 2>/dev/null
```

### Multi-turn pattern

```bash
printf '{"type":"message","content":"Research topic X","message_id":"msg_0001"}\n{"type":"message","content":"Now summarize in 3 bullets","message_id":"msg_0002"}\n{"type":"shutdown"}\n' \
  | primordial run <agent-url> --agent 2>/dev/null
```

### Reading the output

stdout contains NDJSON lines:
- `{"type": "ready"}` — agent is ready
- `{"type": "activity", "tool": "...", "description": "..."}` — agent is working
- `{"type": "response", "content": "...", "done": true}` — the final answer

**Parse the line where `"done": true` to get the agent's response.**

### Fallback (no daemon)

If the daemon isn't running, the CLI falls back to interactive mode. Pipe setup responses before your NDJSON:

```bash
printf '0\n\ny\n{"type":"message","content":"YOUR TASK","message_id":"msg_0001"}\n{"type":"shutdown"}\n' \
  | primordial run <agent-url> --agent 2>/dev/null
```

- `0\n` — new session
- `\n` — accept auto session name
- `y\n` — approve permissions

Filter NDJSON lines from stdout (skip non-JSON setup text).

## Step 3: Parse the Response

The response content is in the `"content"` field of the line where `"done": true`.

## Error Handling

- **Missing API key**: Tell the user to run `primordial keys add <provider>`
- **Vault decryption error**: The daemon isn't running. Tell the user to check `primordial serve`
- **Agent not found**: Search returned empty results. Try a broader query.
- **Timeout**: Set a generous bash timeout (5+ minutes) — agents may take time for complex tasks.

## Important Notes

- Always use `2>/dev/null` to suppress stderr (spinners, debug logs)
- Set bash timeout to at least 300000ms (5 minutes) for research tasks
- The agent sees its own permissions and API keys — you don't need to provide them
- Each agent runs in full isolation — it cannot access your local filesystem
- With the daemon running, you never need to handle API keys, sessions, or permissions
