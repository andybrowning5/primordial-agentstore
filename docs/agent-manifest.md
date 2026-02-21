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
  language: python
  run_command: python -u src/agent.py
  setup_command: pip install -r requirements.txt
  dependencies: requirements.txt
  e2b_template: base
  default_model:
    provider: anthropic
    model: claude-sonnet-4-5-20250929
  resources:
    max_memory: 2GB
    max_cpu: 2

keys:
  - provider: anthropic
    env_var: ANTHROPIC_API_KEY
    domain: api.anthropic.com
    auth_style: x-api-key
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
| `name` | string | yes | — | Agent identifier. 3-40 chars, lowercase + hyphens. |
| `display_name` | string | yes | — | Human-readable name |
| `version` | string | yes | — | Semver version |
| `description` | string | yes | — | What the agent does. Write for humans and AI callers. |
| `category` | string | no | `"general"` | Category for discovery |
| `tags` | list[string] | no | `[]` | Tags for discovery |

### `author`

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `name` | string | yes | — |
| `github` | string | no | `null` |

### `runtime`

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `language` | string | no | `"python"` | Language identifier |
| `run_command` | string | no | `null` | Agent entrypoint command |
| `setup_command` | string | no | `null` | Runs once at sandbox startup |
| `dependencies` | string | no | `null` | Dependencies file (checked for existence) |
| `e2b_template` | string | no | `"base"` | Sandbox template. Must be `"base"`. |
| `default_model.provider` | string | no | `"anthropic"` | LLM provider |
| `default_model.model` | string | no | `"claude-sonnet-4-5-20250929"` | Model ID |
| `resources.max_memory` | string | no | `"2GB"` | Memory limit |
| `resources.max_cpu` | int | no | `2` | CPU limit |

### `keys`

Each entry declares an API key the agent needs. Keys are injected as environment variables via the security proxy.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `provider` | string | yes | — | Provider name. Lowercase letters, numbers, hyphens. |
| `env_var` | string | no | `<PROVIDER>_API_KEY` | Env var name for the session token |
| `required` | bool | no | `true` | Whether this key must be present |
| `domain` | string | yes | — | API domain for the proxy to connect to |
| `auth_style` | string | no | `"bearer"` | How the proxy sends the key upstream |
| `base_url_env` | string | no | `<PROVIDER>_BASE_URL` | Env var for the proxy's localhost URL |

Every provider declares its `domain` and `auth_style` explicitly. See [Custom Providers](custom-providers.md) for examples.

### `permissions`

#### `permissions.network`

List of allowed outbound domains. Each entry:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `domain` | string | yes | FQDN (must have a dot, must contain a letter) |
| `reason` | string | yes | Why the agent needs this domain (shown to user) |

#### Other permission fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `network_unrestricted` | bool | `false` | Full internet access (requires user approval) |
| `filesystem.workspace` | string | `"readwrite"` | `"none"`, `"readonly"`, or `"readwrite"` |
| `delegation.enabled` | bool | `false` | Can this agent spawn sub-agents? |
| `delegation.allowed_agents` | list[string] | `[]` | Restrict which agents can be delegated to |

## Validation Rules

| Field | Rule |
|-------|------|
| `provider` | `^[a-z][a-z0-9-]*$` — no underscores |
| `env_var` | `^[A-Z][A-Z0-9_]*$` — cannot be a protected name (`PATH`, `HOME`, etc.) |
| `domain` | FQDN with at least one dot and one letter. No IP literals. |
| `base_url_env` | `^[A-Z][A-Z0-9_]*$` — cannot be a protected name |
| `auth_style` | Any valid header name (`^[a-z][a-z0-9-]*$`) |
| `e2b_template` | Must be `"base"` |

### Protected Environment Variables

These names cannot be used for `env_var` or `base_url_env`:

```
PATH, HOME, USER, SHELL, LANG, LC_ALL, LC_CTYPE, TERM, TZ,
PYTHONPATH, NODE_PATH, LD_PRELOAD, LD_LIBRARY_PATH,
DYLD_LIBRARY_PATH, DYLD_INSERT_LIBRARIES
```
