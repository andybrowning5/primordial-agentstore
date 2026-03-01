# Publishing Agents

Share your agent so anyone can discover and run it with `primordial search`.

## Requirements

1. A **public GitHub repo** with your agent code
2. An `agent.yaml` manifest at the repo root
3. The `primordial-agent` topic on the repo

## Step by Step

### 1. Create a GitHub repo

```
my-agent/
├── agent.yaml
├── requirements.txt       # or package.json, Cargo.toml, etc.
├── README.md
└── src/
    └── agent.py
```

### 2. Add the `primordial-agent` topic

Go to your repo → Settings → Topics → add `primordial-agent`.

Or via CLI:

```bash
gh repo edit --add-topic primordial-agent
```

This is how `primordial search` discovers agents.

### 3. Write a good README

Include:
- What the agent does
- Required API keys
- Usage: `primordial run https://github.com/you/my-agent`
- An example conversation

### 4. Test it

```bash
# Run from local directory
primordial run ./my-agent

# Run from GitHub URL (simulates what users will do)
primordial run https://github.com/you/my-agent
```

### 5. Verify discovery

```bash
primordial search
```

Your agent should appear in the list.

## Manifest Checklist

Before publishing, verify your `agent.yaml`:

- [ ] `name` — lowercase, hyphens only, 3-40 chars
- [ ] `display_name` — human-readable
- [ ] `version` — semver (e.g., `0.1.0`)
- [ ] `description` — clear, concise. Write for humans AND AI callers (other agents read this for delegation)
- [ ] `author.name` and `author.github` — your identity
- [ ] `runtime.run_command` — the entrypoint. Use `python -u` for Python (unbuffered stdout)
- [ ] `runtime.setup_command` — dependency installation (e.g., `pip install -r requirements.txt`)
- [ ] `keys` — every API key the agent needs, with correct `provider`
- [ ] `permissions.network` — every domain, with a clear `reason`
- [ ] `permissions.filesystem.workspace` — minimum needed (`readonly` if possible)

## Versioning

Use semver in your manifest `version` field. Users see this when they run your agent. Bump it when you ship changes:

- **Patch** (0.1.1) — bug fixes
- **Minor** (0.2.0) — new features, backward compatible
- **Major** (1.0.0) — breaking changes

## Developer Checklist

Complete every item before publishing. Each section links to the relevant doc for details.

### Repository Setup

- [ ] Code is in a **public GitHub repository**
- [ ] `primordial-agent` **topic** added to the repo (`gh repo edit --add-topic primordial-agent`)
- [ ] **README.md** includes: what the agent does, required API keys, usage command, example conversation

### Manifest (`agent.yaml`)

- [ ] File exists at **repo root**
- [ ] `name` — lowercase + hyphens only, 3–40 chars, matches `^[a-z][a-z0-9-]*$`
- [ ] `display_name` — human-readable name
- [ ] `version` — valid semver (e.g., `0.1.0`)
- [ ] `description` — clear and informative (written for humans AND AI callers)
- [ ] `author.name` filled in (and ideally `author.github`)

See [Agent Manifest](agent-manifest.md) for the full field reference.

### Runtime

- [ ] `runtime.run_command` set — uses `python -u` for Python (unbuffered stdout is **required**)
- [ ] `runtime.setup_command` installs all deps (e.g., `pip install -r requirements.txt`)
- [ ] `runtime.dependencies` points to an existing file (`requirements.txt`, `package.json`, etc.)
- [ ] `runtime.resources` — memory/CPU limits are reasonable (defaults: 2GB / 2 CPU)

### API Keys

- [ ] Every API key declared in `keys` with `provider`, `domain`, and `auth_style`
- [ ] `provider` matches `^[a-z][a-z0-9-]*$` (no underscores)
- [ ] `domain` is a valid FQDN (not an IP address or `localhost`)
- [ ] `auth_style` is correct for each API (`bearer`, `x-api-key`, `x-subscription-token`, or custom header)
- [ ] `env_var` / `base_url_env` don't collide with protected system variables (`PATH`, `HOME`, `SHELL`, etc.)
- [ ] Agent code reads `<PROVIDER>_BASE_URL` env var for all HTTP calls (required for proxy routing)

See [Setting Up APIs](api-setup.md) for proxy and key vault details.

### Permissions

- [ ] Every outbound domain listed in `permissions.network` with a `reason`
- [ ] `permissions.filesystem.workspace` set to minimum needed (`readonly` if possible, `none` if no file I/O)
- [ ] `permissions.delegation.enabled` is only `true` if the agent spawns sub-agents
- [ ] `network_unrestricted` is `false` unless absolutely necessary

### Protocol Compliance

- [ ] Agent sends `{"type": "ready"}` on stdout **before** reading stdin
- [ ] Every inbound `message` gets a response with matching `message_id` and `done: true`
- [ ] Agent handles `{"type": "shutdown"}` gracefully (cleanup and exit)
- [ ] **All debug/log output goes to stderr** — stdout is protocol-only
- [ ] Streaming responses use `"done": false` for intermediate chunks, `"done": true` for the final chunk

See [Primordial Protocol](primordial-protocol.md) for the full message spec.

### Persistence (if applicable)

- [ ] Persistent data written only to allowed directories: `workspace/`, `data/`, `output/`, `state/`
- [ ] No reliance on dotfiles, `/tmp/`, or package caches (wiped between sessions)

### Testing

- [ ] **Local run** passes: `primordial run ./my-agent`
- [ ] **Remote run** passes: `primordial run https://github.com/you/my-agent`
- [ ] **Fresh session** test passes: `primordial cache clear --all` then run again (catches missing deps)
- [ ] **Discovery** works: `primordial search` shows your agent
- [ ] Agent handles edge cases: empty input, malformed JSON, rapid successive messages

---

## Tips

- Keep `description` informative — it's shown in `primordial search` results and used by other agents for delegation decisions
- Minimize permissions — users are more likely to approve agents that request only what they need
- Include a `reason` for every network domain — "LLM inference" is better than "API access"
- Test with a fresh session (`primordial cache clear --all`) to catch missing dependencies
