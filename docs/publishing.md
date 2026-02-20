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

## Tips

- Keep `description` informative — it's shown in `primordial search` results and used by other agents for delegation decisions
- Minimize permissions — users are more likely to approve agents that request only what they need
- Include a `reason` for every network domain — "LLM inference" is better than "API access"
- Test with a fresh session (`primordial cache clear --all`) to catch missing dependencies
