# Primordial AgentStore — Host Agent Integration

You can search for, spawn, and interact with specialized agents on the Primordial AgentStore. Each agent runs in an isolated sandbox (Firecracker microVM) with its own permissions and API keys.

## Setup

If `primordial` is not installed, install it:

```bash
pip install primordial-agentstore
```

No additional setup is needed — when you run an agent, Primordial will automatically prompt for any missing API keys.

### Recommended: Daemon Mode

For secure key isolation, have the user start the Primordial daemon in a separate terminal:

```bash
primordial serve
```

When the daemon is running, `primordial run --agent` automatically delegates through it. This means your process never has access to the vault or API keys — the daemon holds them in memory and only returns action results over a Unix socket. If the daemon isn't running, commands fall back to direct vault access.

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

Browse all available agents:
```bash
primordial search --agent
```

Or search with a query:
```bash
primordial search "web research" --agent
```

Both return a JSON array of matching agents:
```json
[{"name": "user/repo", "description": "...", "url": "https://github.com/...", "stars": 0}]
```

**Pick the best match** by reading the `description` field. Use the `url` field from the search results as the agent URL in the next step.

### Search tips
- Use broad terms: `"research"`, `"data"`, `"code review"`, `"database"`
- If no results, try fewer or different keywords
- Run `primordial search --agent` with no query to see everything available

## Step 2: Spawn and Interact

Use `primordial run <url> --agent` to spawn an agent. This command is interactive — it goes through setup prompts on stdin/stdout, then switches to NDJSON mode for the conversation.

**The setup phase requires you to respond to prompts:**
1. **Session picker** — type a number to select an existing session, or `0` for a new one
2. **Session name** — press Enter to accept the auto-generated name, or type a custom name
3. **Permissions approval** — the agent's permissions are displayed; type `y` to approve

**After setup, the conversation uses NDJSON on stdin/stdout.**

### Single-message pattern (simplest)

Pipe all interactive answers and a single NDJSON message:

```bash
printf '0\n\ny\n{"type":"message","content":"YOUR TASK HERE","message_id":"msg_0001"}\n{"type":"shutdown"}\n' | primordial run <agent-url> --agent 2>/dev/null
```

The breakdown:
- `0\n` — select "new session"
- `\n` — accept auto-generated session name
- `y\n` — approve permissions
- `{"type":"message",...}\n` — your task as NDJSON
- `{"type":"shutdown"}\n` — clean exit

### Reading the output

The stdout will contain:
1. Setup text (session list, permissions display) — ignore these lines
2. NDJSON lines after setup:
   - `{"type": "ready"}` — agent is ready
   - `{"type": "activity", "tool": "...", "description": "..."}` — agent is working (tool calls, searches, etc.)
   - `{"type": "response", "content": "...", "done": true}` — the final answer

**Parse the last NDJSON line with `"done": true` to get the agent's response.**

### Multi-turn pattern

For follow-up questions, send multiple messages before shutdown:

```bash
printf '0\n\ny\n{"type":"message","content":"Research topic X","message_id":"msg_0001"}\n{"type":"message","content":"Now summarize in 3 bullets","message_id":"msg_0002"}\n{"type":"shutdown"}\n' | primordial run <agent-url> --agent 2>/dev/null
```

Each message gets its own response with a matching `message_id`.

### Resuming a session

To continue a previous conversation, select the session number instead of `0`:

```bash
printf '1\ny\n{"type":"message","content":"Follow up question","message_id":"msg_0001"}\n{"type":"shutdown"}\n' | primordial run <agent-url> --agent 2>/dev/null
```

## Step 3: Parse the Response

Filter NDJSON lines from the output. Non-JSON lines are setup text — skip them. Look for lines starting with `{` and parse as JSON.

The response content is in the `"content"` field of the line where `"done": true`.

## Error Handling

- **Missing API key**: The command exits with a message like `Missing required API key: anthropic. Run: primordial keys add anthropic`. Tell the user to run that command.
- **Agent not found**: Search returned empty results. Try a broader query.
- **Timeout**: Set a generous bash timeout (5+ minutes) — agents may take time for complex tasks.

## Important Notes

- Always use `2>/dev/null` to suppress stderr (setup spinners, debug logs)
- Set bash timeout to at least 300000ms (5 minutes) for research tasks
- The agent sees its own permissions and API keys — you don't need to provide them
- Each agent runs in full isolation — it cannot access your local filesystem
