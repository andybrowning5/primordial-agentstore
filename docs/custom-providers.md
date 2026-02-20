# Custom Providers

Primordial auto-configures known LLM providers (Anthropic, OpenAI, Google, Groq, Mistral, DeepSeek). For any other API, you declare the connection details in your manifest.

## How It Works

When your agent declares a key requirement, Primordial sets up a **reverse proxy** inside the sandbox. Your agent gets:

1. A **session token** in the env var (not the real key)
2. A **localhost URL** in the base URL env var

The proxy intercepts requests, swaps the session token for the real key, and forwards to the upstream API. Your agent never sees the real key.

## Declaring a Custom Provider

Add `domain`, `base_url_env`, and `auth_style` to your key entry:

```yaml
keys:
  - provider: brave
    env_var: BRAVE_API_KEY
    required: true
    domain: api.search.brave.com
    base_url_env: BRAVE_BASE_URL
    auth_style: x-subscription-token
```

| Field | What It Does |
|-------|-------------|
| `domain` | The upstream API host the proxy connects to via HTTPS |
| `base_url_env` | Env var your code reads for the base URL (points to localhost proxy) |
| `auth_style` | Header name the proxy uses to send the real key upstream |

## Auth Styles

The `auth_style` field tells the proxy which HTTP header to use for authentication:

| `auth_style` value | Header sent upstream | Example APIs |
|--------------------|---------------------|-------------|
| `bearer` (default) | `Authorization: Bearer <key>` | OpenAI, Google, most APIs |
| `x-api-key` | `x-api-key: <key>` | Anthropic |
| `x-subscription-token` | `X-Subscription-Token: <key>` | Brave Search |
| Any header name | `<header>: <key>` | Custom APIs |

You can use any valid HTTP header name. The proxy will send the real key in that header.

## Example: Brave Search Agent

**agent.yaml:**

```yaml
name: web-research-agent
display_name: Web Research Agent
version: 0.1.0
description: Research agent using Brave Search and Claude.

author:
  name: Your Name
  github: your-handle

runtime:
  language: python
  run_command: python -u src/agent.py
  setup_command: pip install -r requirements.txt

keys:
  - provider: anthropic
    env_var: ANTHROPIC_API_KEY
    required: true
  - provider: brave
    env_var: BRAVE_API_KEY
    required: true
    domain: api.search.brave.com
    base_url_env: BRAVE_BASE_URL
    auth_style: x-subscription-token

permissions:
  network:
    - domain: api.anthropic.com
      reason: LLM inference
    - domain: api.search.brave.com
      reason: Web search
```

**agent.py** (relevant part):

```python
import os
import httpx

BRAVE_API_KEY = os.environ.get("BRAVE_API_KEY", "")  # Session token
BRAVE_BASE_URL = os.environ.get("BRAVE_BASE_URL", "https://api.search.brave.com")

resp = httpx.get(
    f"{BRAVE_BASE_URL}/res/v1/web/search",
    params={"q": query, "count": 10},
    headers={
        "Accept": "application/json",
        "X-Subscription-Token": BRAVE_API_KEY,  # Proxy swaps this for real key
    },
)
```

## What Happens at Runtime

1. Primordial reads your manifest and sees `provider: brave` with custom config
2. Starts a proxy on `http://127.0.0.1:9002` (port assigned automatically)
3. Sets `BRAVE_API_KEY=sess-abc123...` (session token) and `BRAVE_BASE_URL=http://127.0.0.1:9002`
4. Your agent sends requests to `http://127.0.0.1:9002/res/v1/web/search` with the session token
5. The proxy validates the session token, strips it, injects the real Brave API key as `X-Subscription-Token`, and forwards to `https://api.search.brave.com`

## Important Notes

- **Use the base URL env var** — don't hardcode the API URL. The proxy redirects traffic through localhost.
- **Send the session token** in the header matching your `auth_style`. The proxy validates it there.
- **Network permissions** — you still need to declare the domain in `permissions.network` so the firewall allows the proxy to reach upstream.
- **Known providers** (Anthropic, OpenAI, etc.) ignore custom `domain` overrides for security. Only unknown providers use the manifest-declared domain.
