# Agent Manifest Reference

Every agent declares its identity, runtime, and permissions in `agent.yaml`.

## Full Example

```yaml
name: my-agent
display_name: My Agent
version: 0.1.0
description: >
  Analyzes code and finds bugs.

category: general
tags:
  - code
  - analysis

author:
  name: Your Name
  github: your-handle

runtime:
  language: node
  run_command: node src/agent.mjs
  setup_command: npm install
  dependencies: package.json
  default_provider: anthropic
  resources:
    max_memory: 2GB
    max_cpu: 2

keys:
  - provider: anthropic    # known provider — no domain or auth_style needed
    required: true

permissions:
  network:
    - domain: api.anthropic.com
      reason: LLM inference
  network_unrestricted: false
  filesystem:
    workspace: readwrite
  delegation:
    enabled: false
```

## Field Reference

### Top-Level

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | yes | — | Agent identifier. 3-40 chars, lowercase + hyphens. Must match `^[a-z][a-z0-9-]*[a-z0-9]$` (must not end with a hyphen). |
| `display_name` | string | yes | — | Human-readable name |
| `version` | string | yes | — | Semver version |
| `description` | string | yes | — | What the agent does. Write for humans and AI callers. |
| `category` | string | no | `"general"` | Category for discovery. See [valid categories](#valid-categories). |
| `tags` | list[string] | no | `[]` | Tags for discovery |

### `author`

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `name` | string | yes | — |
| `github` | string | no | `null` |
| `website` | string | no | `null` | Optional URL (`http://` or `https://`). |

### `runtime`

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `language` | string | no | `"python"` | Language identifier. See [valid languages](#valid-languages). |
| `mode` | string | no | `"agent"` | `"agent"` (NDJSON protocol) |
| `run_command` | string | yes | — | Agent entrypoint command |
| `setup_command` | string | no | `null` | Runs once at sandbox startup |
| `dependencies` | string | no | `null` | Dependencies file (checked for existence) |
| `default_provider` | string | no | `"anthropic"` | LLM provider for key scoping |
| `resources.max_memory` | string | no | `"2GB"` | Memory limit |
| `resources.max_cpu` | int | no | `2` | CPU limit. Valid range: 1-32. |
| `resources.max_time` | string | no | `"30m"` | Sandbox timeout. Examples: `"30m"`, `"2h"`, `"6h"`. |

### `keys`

Each entry declares an API key the agent needs. Keys are injected as environment variables via the security proxy.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `provider` | string | yes | — | Provider name. Lowercase letters, numbers, hyphens. |
| `env_var` | string | no | `<PROVIDER>_API_KEY` | Env var name for the session token |
| `required` | bool | no | `true` | Whether this key must be present |
| `domain` | string | **unknown providers only** | — | API domain for the proxy to connect to. Must not be set for known providers. |
| `auth_style` | string | **unknown providers only** | — | How the proxy sends the key upstream. One of: `bearer`, `x-api-key`, `x-subscription-token`. Must not be set for known providers. |
| `base_url_env` | string | no | `<PROVIDER>_BASE_URL` | Env var for the proxy's localhost URL |

**Known providers** (45 providers including `anthropic`, `openai`, `google-ai`, `mistral`, `groq`, `brave`, `tavily`, `github`, `stripe`, and more) have their `domain` and `auth_style` locked in by Primordial — do not declare these fields. Unknown providers must declare `domain` explicitly.

See [Setting Up APIs](api-setup.md) for the full known provider list and examples.

### `permissions`

#### `permissions.network`

List of allowed outbound domains. Each entry:

> **Note:** When `runtime.setup_command` is specified, package registries (pypi.org, registry.npmjs.org, etc.) are automatically allowed so dependency installation works. You don't need to declare them in `permissions.network`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `domain` | string | yes | FQDN (must have a dot, must contain a letter) |
| `reason` | string | yes | Why the agent needs this domain (shown to user) |

#### Other permission fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `network_unrestricted` | bool | `false` | Full internet access (requires user approval) |
| `filesystem.workspace` | string | `"readwrite"` | `"none"`, `"readonly"`, or `"readwrite"` — see [Workspace Isolation](../users/workspace-isolation.md) |
| `delegation.enabled` | bool | `false` | Can this agent spawn sub-agents? |
| `delegation.allowed_agents` | list[string] | `[]` | Restrict which agents can be delegated to |

**Delegation limits (enforced host-side, cannot be overridden):**
- Max delegation depth: **3** — agents can delegate up to 3 levels deep
- Max concurrent sub-agents per parent: **6**

See [Delegation](delegation.md) for the full delegation guide.

## Validation Rules

| Field | Rule |
|-------|------|
| `provider` | `^[a-z][a-z0-9-]*$` — no underscores |
| `env_var` | `^[A-Z][A-Z0-9_]*$` — cannot be a protected name (`PATH`, `HOME`, etc.) |
| `domain` | FQDN with at least one dot and one letter. No IP literals. Required for unknown providers; must not be set for known providers. |
| `base_url_env` | `^[A-Z][A-Z0-9_]*$` — cannot be a protected name |
| `auth_style` | One of: `bearer`, `x-api-key`, `x-subscription-token`. Must not be set for known providers. |

### Protected Environment Variables

These names cannot be used for `env_var` or `base_url_env`:

```
PATH, HOME, USER, SHELL, LANG, LC_ALL, LC_CTYPE, TERM, TZ,
PYTHONPATH, NODE_PATH, LD_PRELOAD, LD_LIBRARY_PATH,
DYLD_LIBRARY_PATH, DYLD_INSERT_LIBRARIES, WORKSPACE, E2B_API_KEY
```

### Valid Categories

```
general, coding, data, writing, research, devops, security, finance, science, productivity
```

### Valid Languages

```
python, node, javascript, typescript, ruby, go, rust, java, bash, sh
```
