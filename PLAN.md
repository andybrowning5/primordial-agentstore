# AgentStore Persistence Protocol — Implementation Plan

## Design Philosophy
One file, one API, zero magic. A developer adds `persistence.yaml` to their agent and the SDK handles the rest.

---

## What Exists Today

1. **Filesystem snapshot** — On session end, the sandbox manager tar.gz's `/home/user/` (excluding system dirs) and restores it on next session start. This already works but is invisible to agent developers.

2. **`save_state(key, data)` / `load_state(key)`** — JSON key-value store in the SDK's `_AgentBase` class. Writes to `$AGENT_STATE_DIR/{key}.json`.

Both are low-level primitives with no convention or documentation around them.

---

## What We're Adding

### 1. `persistence.yaml` — Developer-Declared Persistent Config

Lives in the agent's root directory alongside `agent.yaml`. Declares what config values should persist across sessions and how they're initialized.

```yaml
# persistence.yaml
version: 1

# Key-value config that persists across sessions
# Values are initialized on first run, then preserved
config:
  zep_user_id:
    description: "Zep memory user ID for this agent"
    init: "{{ agent_name }}::{{ random_id }}"  # template evaluated on first run

  zep_session_id:
    description: "Current Zep session ID"
    init: "{{ agent_name }}-{{ timestamp }}"
    on_new_session: regenerate  # regenerate on each new session (default: preserve)

  user_name:
    description: "The user's preferred name"
    init: null  # starts empty, agent sets it during conversation

  theme:
    description: "User's preferred color theme"
    init: "default"

# Directories to persist across sessions (beyond the default snapshot)
# These paths are relative to the agent's home directory
persist_paths:
  - data/       # agent's data files
  - .config/    # agent config files
```

**Template variables available in `init`:**
- `{{ agent_name }}` — from agent.yaml `name` field
- `{{ random_id }}` — 8-char random hex string
- `{{ timestamp }}` — ISO timestamp
- `{{ uuid }}` — UUID v4

**`on_new_session` options:**
- `preserve` (default) — keep value across sessions
- `regenerate` — re-run the `init` template each session

### 2. SDK API — `self.config` Property

Add a `PersistentConfig` object to the Agent base class that reads/writes persistence.yaml values.

```python
# In the agent's code:
class MyAgent(Agent):
    def setup(self):
        # Read a persisted value
        zep_user = self.config.get("zep_user_id")

        # Write/update a persisted value
        self.config.set("user_name", "Andy")

        # Get all config as dict
        all_config = self.config.all()

        # Check if a key exists
        if self.config.has("theme"):
            ...
```

Under the hood:
- On startup: SDK reads `persistence.yaml` for schema, loads saved values from `$AGENT_STATE_DIR/_persistence.json`
- If a key has no saved value, evaluates the `init` template
- If `on_new_session: regenerate`, re-evaluates on each session start
- On any `.set()` call, immediately writes to `_persistence.json`
- The existing filesystem snapshot handles saving `_persistence.json` across sessions

### 3. Documentation Convention

Add a `PERSISTENCE.md` to the SDK docs explaining the three levels:

| Level | What | How | When to use |
|-------|------|-----|-------------|
| **Config** | Named key-value pairs | `persistence.yaml` + `self.config` | IDs, preferences, settings |
| **State** | Arbitrary JSON blobs | `self.save_state()` / `self.load_state()` | Conversation history, task lists, caches |
| **Files** | Raw filesystem | Just write files to `~/data/` | Databases, large files, exports |

All three levels are automatically persisted by the snapshot system.

---

## Implementation Steps

### Step 1: `PersistentConfig` class in SDK
**File:** `AgentStore/sdk/src/agentstore_sdk/persistence.py` (new)

- `PersistentConfig` class
  - `__init__(self, state_dir, schema_path=None)` — loads schema + saved values
  - `get(key) -> Any`
  - `set(key, value)` — validates key exists in schema, saves immediately
  - `has(key) -> bool`
  - `all() -> dict`
  - `_load()` — read `_persistence.json` from state_dir
  - `_save()` — write `_persistence.json` to state_dir
  - `_init_value(key, template)` — evaluate init template
  - `_handle_new_session(key, config)` — check on_new_session policy

### Step 2: Wire into `_AgentBase`
**File:** `AgentStore/sdk/src/agentstore_sdk/agent.py` (edit)

- Add `self.config` property that lazy-initializes `PersistentConfig`
- Look for `persistence.yaml` in agent directory (alongside the running code)
- Pass `state_dir` for storage location

### Step 3: Load `persistence.yaml` in sandbox manager
**File:** `AgentStore/packages/client/src/agentstore/sandbox/manager.py` (edit)

- When uploading agent code, also upload `persistence.yaml` to sandbox
- On first run (no existing state), initialize `_persistence.json` from schema defaults
- This is already handled by the existing code upload step — persistence.yaml lives with agent code

### Step 4: Update Gus to use the new protocol
**File:** `gus/persistence.yaml` (new)
**File:** `gus/src/zep_memory.py` (edit)
**File:** `gus/src/agentstore_adapter.py` (edit)

- Add `persistence.yaml` with `zep_user_id` and `zep_session_id`
- Update `zep_memory.py` to read user/session IDs from `self.config` instead of hardcoding
- Fix the async crash while we're in there

### Step 5: SDK package update
**File:** `AgentStore/sdk/src/agentstore_sdk/__init__.py` (edit)

- Export `PersistentConfig` from package
- Bump SDK version

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `sdk/src/agentstore_sdk/persistence.py` | CREATE | PersistentConfig class |
| `sdk/src/agentstore_sdk/agent.py` | EDIT | Add `self.config` property |
| `sdk/src/agentstore_sdk/__init__.py` | EDIT | Export new class |
| `gus/persistence.yaml` | CREATE | Gus's persistence config |
| `gus/src/zep_memory.py` | EDIT | Use config API for Zep IDs |
| `gus/src/agentstore_adapter.py` | EDIT | Pass config to agent, fix crash |

---

## What a Developer Sees

To add persistence to their agent:

1. Create `persistence.yaml` next to `agent.yaml`:
```yaml
version: 1
config:
  zep_user_id:
    description: "Zep user ID"
    init: "{{ agent_name }}::{{ random_id }}"
```

2. Use `self.config` in their agent code:
```python
class MyAgent(Agent):
    def setup(self):
        user_id = self.config.get("zep_user_id")
        # user_id is auto-generated on first run, preserved forever after
```

That's it. No database, no extra services, no configuration beyond the yaml file.
