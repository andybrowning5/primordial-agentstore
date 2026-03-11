# Searching for Agents

Primordial uses semantic search to help you find the right agent for any task. Instead of matching exact keywords, it understands what you mean — so searching for "documentation review" will find an agent called "docs-drift-checker" even though the words don't match literally.

## How to search

### From the CLI

```bash
primordial search "web research"
```

This fetches all available agents, ranks them by how well they match your query, and shows the top results in a table. You can pick one to run immediately.

### From a host agent (Claude Code, etc.)

Host agents search via the background daemon's HTTP API:

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:19400/search \
  -d '{"query": "web research"}'
```

The daemon returns a ranked JSON list of matching agents.

### Blank search

Omitting the query returns all agents sorted by popularity (stars), capped at 25:

```bash
primordial search
```

## What gets matched

Search doesn't just look at agent names. It considers everything it knows about an agent:

- **Name and description** — from the agent's GitHub repo
- **Tags and category** — from the `agent.yaml` manifest (e.g. `tags: [documentation, review]`)
- **API providers** — which APIs the agent uses (e.g. Anthropic, Brave)
- **Permissions** — whether the agent can delegate to sub-agents or access the network

This means you can search by capability:

```bash
primordial search "agent that uses anthropic api"
primordial search "doc review agent that can delegate"
primordial search "web research"
```

The manifest fields are available for agents you've run before (since Primordial caches their repos locally). For agents you haven't run yet, search still works using the name and description from GitHub.

## Updating the daemon

After upgrading Primordial, restart the daemon so it picks up the new code:

```bash
pip install --upgrade primordial-agentstore && primordial restart
```
