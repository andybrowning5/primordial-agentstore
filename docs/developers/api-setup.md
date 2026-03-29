# Setting Up APIs

## How It Works

When your agent declares a key requirement, Primordial sets up a **reverse proxy** inside the sandbox. Your agent gets:

1. A **session token** in the env var (not the real key)
2. A **localhost URL** in the base URL env var

The proxy intercepts requests, swaps the session token for the real key, and forwards to the upstream API. Your agent never sees the real key.

## Known Providers (Recommended)

Primordial ships with a registry of 45 common API providers. For any provider in this list, you only need to declare `provider` — no `domain` or `auth_style` needed. Primordial locks in the canonical domain and auth style automatically.

```yaml
keys:
  - provider: anthropic    # domain and auth_style inferred from registry
    required: true
  - provider: brave
    required: true
  - provider: openai
    required: true
```

**Declaring `domain` or `auth_style` on a known provider is an error.** This prevents manifests from redirecting traffic to lookalike domains.

### Known Provider List

| Provider | Domain | Auth Style |
|----------|--------|------------|
| `anthropic` | `api.anthropic.com` | `x-api-key` |
| `openai` | `api.openai.com` | `bearer` |
| `google-ai` | `generativelanguage.googleapis.com` | `bearer` |
| `mistral` | `api.mistral.ai` | `bearer` |
| `cohere` | `api.cohere.com` | `bearer` |
| `together` | `api.together.xyz` | `bearer` |
| `groq` | `api.groq.com` | `bearer` |
| `deepseek` | `api.deepseek.com` | `bearer` |
| `perplexity` | `api.perplexity.ai` | `bearer` |
| `fireworks` | `api.fireworks.ai` | `bearer` |
| `replicate` | `api.replicate.com` | `bearer` |
| `hugging-face` | `api-inference.huggingface.co` | `bearer` |
| `xai` | `api.x.ai` | `bearer` |
| `cerebras` | `api.cerebras.ai` | `bearer` |
| `brave` | `api.search.brave.com` | `x-subscription-token` |
| `serper` | `google.serper.dev` | `x-api-key` |
| `tavily` | `api.tavily.com` | `bearer` |
| `exa` | `api.exa.ai` | `bearer` |
| `firecrawl` | `api.firecrawl.dev` | `bearer` |
| `jina` | `r.jina.ai` | `bearer` |
| `pinecone` | `api.pinecone.io` | `x-api-key` |
| `supabase` | `api.supabase.io` | `bearer` |
| `github` | `api.github.com` | `bearer` |
| `linear` | `api.linear.app` | `bearer` |
| `notion` | `api.notion.com` | `bearer` |
| `stripe` | `api.stripe.com` | `bearer` |
| `sendgrid` | `api.sendgrid.com` | `bearer` |
| `slack` | `slack.com` | `bearer` |
| `openweather` | `api.openweathermap.org` | `x-api-key` |
| `polygon-io` | `api.polygon.io` | `bearer` |
| `e2b` | `api.e2b.dev` | `bearer` |

For the complete list, see [`known_providers.py`](../../packages/client/src/primordial/known_providers.py).

## Unknown Providers

If your provider isn't in the registry, declare `domain` explicitly:

```yaml
keys:
  - provider: my-custom-llm
    domain: api.my-custom-llm.com
    auth_style: bearer        # optional, defaults to bearer
    required: true
```

When users run an agent with an unknown provider, they'll see a warning and be asked to approve the connection. This is intentional — it prevents prompt injection attacks from silently routing traffic to arbitrary domains.

## Base URL Env Var

The proxy redirects your agent's API calls through localhost. It sets an environment variable with the localhost URL. By default this is `<PROVIDER>_BASE_URL` — so for `provider: anthropic`, it sets `ANTHROPIC_BASE_URL=http://127.0.0.1:9001`.

**Most SDKs already check this variable by convention.** The Anthropic SDK reads `ANTHROPIC_BASE_URL`, the OpenAI SDK reads `OPENAI_BASE_URL`, etc. So you don't need to declare `base_url_env` at all — it just works.

**Only set `base_url_env` when the default doesn't match what your code expects:**

```yaml
keys:
  - provider: my-custom-llm
    domain: api.my-custom-llm.com
    base_url_env: CUSTOM_LLM_API_BASE   # your code reads this instead of MY-CUSTOM-LLM_BASE_URL
```

## Auth Styles

The `auth_style` field tells the proxy which HTTP header to use for authentication:

| `auth_style` value | Header sent upstream | Example APIs |
|--------------------|---------------------|-------------|
| `bearer` (default) | `Authorization: Bearer <key>` | OpenAI, Google, most APIs |
| `x-api-key` | `x-api-key: <key>` | Anthropic |
| `x-subscription-token` | `X-Subscription-Token: <key>` | Brave Search |

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
  language: node
  run_command: node src/agent.mjs
  setup_command: npm install

keys:
  - provider: anthropic    # known provider — no domain/auth_style needed
    required: true
  - provider: brave        # known provider — x-subscription-token inferred
    env_var: BRAVE_API_KEY
    base_url_env: BRAVE_BASE_URL
    required: true

permissions:
  network:
    - domain: api.anthropic.com
      reason: LLM inference
    - domain: api.search.brave.com
      reason: Web search
```

**agent.mjs** (relevant part):

```js
const BRAVE_API_KEY = process.env.BRAVE_API_KEY ?? "";  // Session token
const BRAVE_BASE_URL = process.env.BRAVE_BASE_URL ?? "https://api.search.brave.com";

const url = new URL("/res/v1/web/search", BRAVE_BASE_URL);
url.searchParams.set("q", query);
url.searchParams.set("count", "10");

const resp = await fetch(url, {
  headers: {
    "Accept": "application/json",
    "X-Subscription-Token": BRAVE_API_KEY,  // Proxy swaps this for real key
  },
});

const data = await resp.json();
```

## What Happens at Runtime

1. Primordial reads your manifest and resolves `domain` and `auth_style` (from registry for known providers, or manifest for unknown)
2. Starts a proxy on `http://127.0.0.1:9001` (port assigned automatically)
3. Sets `ANTHROPIC_API_KEY=sess-abc123...` (session token) and `ANTHROPIC_BASE_URL=http://127.0.0.1:9001`
4. Your agent sends requests to the localhost URL with the session token
5. The proxy validates the session token, strips it, injects the real key in the correct auth header, and forwards to the declared domain

## Important Notes

- **Use the base URL env var** — don't hardcode the API URL. The proxy redirects traffic through localhost.
- **Send the session token** in the header matching your `auth_style`. The proxy validates it there.
- **Network permissions** — you still need to declare the domain in `permissions.network` so the firewall allows the proxy to reach upstream.
