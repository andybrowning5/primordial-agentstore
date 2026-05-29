# Security

Primordial runs untrusted agent code in isolated VMs. Agents are treated as hostile — they never see your real API keys, can't access your machine, and can only reach the network domains you approve.

---

## The Big Picture

![Security Model](../diagrams/security-model.svg)

---

## API Key Lifecycle — Step by Step

### 1. User stores a key

```bash
primordial keys add anthropic sk-ant-real-key-here
```

The key is encrypted with AES-128 and saved to a local vault file (`keys.enc`). The encryption key is derived from three things:

- **Your machine's hardware ID** — ties the vault to this specific computer
- **A secret in your OS keychain** — macOS Keychain or a locked file on Linux
- **An optional password** — via `PRIMORDIAL_VAULT_PASSWORD` env var

Result: the vault file is useless on any other machine, even if copied.

### 2. User runs an agent

```bash
primordial run web-research-agent
```

The CLI reads the agent's `agent.yaml` and shows what it needs:

```
Permissions
  Network access:
    - api.anthropic.com: LLM inference
    - api.search.brave.com: Web search
  API keys:
    - anthropic (ANTHROPIC_API_KEY): required — stored
    - brave (BRAVE_API_KEY): required — stored

Approve and run? [y/N]:
```

The user must approve before anything happens.

### 3. CLI decrypts only the requested keys

The manifest says it needs `anthropic` and `brave`. The CLI decrypts only those two keys from the vault. Your `openai` key, `github` key, or anything else stays encrypted and is never touched.

### 4. CLI creates a fresh VM

A new Firecracker microVM is created via E2B. It's a blank slate — no leftover state from previous runs.

The VM's network is locked down at the hypervisor level (outside the VM, so the agent can't tamper with it). Only the domains declared in the manifest are reachable.

### 5. VM is hardened before any agent code runs

As root, before the agent or its setup script touches anything:

- `sudo` and `su` are removed — the agent can't become root
- `/proc` is hidden with `hidepid=2` — the agent can't see other processes
- If `/proc` hiding fails and the agent needs API keys, the whole thing aborts (fail-closed)

### 6. Proxy starts as root and receives real keys

The proxy script is uploaded to the VM (root-owned, mode 700 — the agent can't read it). It starts and receives the real API keys via stdin as a JSON blob. The keys exist only in the proxy's memory — never written to disk, never in environment variables.

The proxy binds localhost ports (9001, 9002, etc.) — one per API. It does this before the agent's setup command runs, so a malicious setup script can't grab those ports first.

### 7. Agent starts with fake credentials

The agent process gets environment variables like:

```
ANTHROPIC_API_KEY=sess-a1b2c3d4e5f6...    (fake session token)
ANTHROPIC_BASE_URL=http://127.0.0.1:9001  (proxy address)
```

The agent (or its SDK) sends requests to `localhost:9001` with the fake token. The proxy:

1. Validates the session token
2. Strips the fake token from the request
3. Injects the real API key in the correct header
4. Forwards to the real API over HTTPS
5. Filters response headers (only safe ones like `content-type` pass through)

The agent never sees the real key. It can't read the proxy's memory (hidepid=2), can't read the proxy script on disk (root-owned), and can't become root to bypass any of this.

### 8. Session ends

The VM is destroyed. Keys are gone from memory. Nothing persists except the allowed directories (`workspace/`, `data/`, `output/`, `state/`).

---

## What the Agent Can't Do

| Attack | Why It Fails |
|--------|-------------|
| Read `os.environ` for real keys | Real keys aren't in env vars — only fake session tokens |
| Read proxy process memory via `/proc` | `/proc` is hidden with `hidepid=2` |
| Read proxy script from disk | Root-owned, `chmod 700` |
| Become root to bypass protections | `sudo`/`su` removed, user removed from sudo group |
| Exfiltrate keys over the network | Network is locked to declared domains only |
| Grab proxy ports during setup | Proxy binds ports before setup runs |
| Inject headers to leak keys | Response headers filtered through safe allowlist |
| Smuggle requests via HTTP tricks | CRLF injection and chunked encoding are blocked |
| Poison state for next session | Only 4 specific directories persist, no dotfiles |
| Access host env vars (AWS keys, etc.) | Only 11 safe env vars forwarded to VM (PATH, HOME, USER, SHELL, LANG, LC_ALL, LC_CTYPE, TERM, TZ, PYTHONPATH, NODE_PATH) |
| Escalate via sub-agents | Each sub-agent gets its own isolated VM with a max delegation depth of 3 and max 6 concurrent sub-agents per parent |

Host environment variables like `AWS_SECRET_ACCESS_KEY`, `GITHUB_TOKEN`, `WORKSPACE`, and `E2B_API_KEY` are never forwarded to the VM. Only the 11 safe vars listed above are passed through.

---

## Vault Encryption Details

| Property | Value |
|----------|-------|
| Algorithm | Fernet (AES-128-CBC + HMAC-SHA256) |
| Key derivation | PBKDF2-HMAC-SHA256, 600,000 iterations |
| Key material | `{machine_id}:{keychain_secret}:{password}` |
| File permissions | `0600` (owner read/write only), checked on every access |
| Writes | Atomic (temp file + rename) to prevent corruption |

On macOS, the keychain secret requires user approval for any process to access. There's no silent fallback — if the keychain is locked, Primordial errors instead of downgrading security.

---

## Proxy Security Details

The proxy (`proxy_script.py`) is stdlib-only Python with zero dependencies:

- **Session token**: 128-bit entropy (`secrets.token_hex(16)`), validated on every request
- **CRLF blocking**: Rejects paths with `\r` or `\n` (prevents header injection)
- **No chunked encoding**: Rejects `Transfer-Encoding` (prevents HTTP smuggling)
- **100MB body cap**: Prevents denial-of-service via large payloads
- **60s socket timeout**: Prevents thread exhaustion via slow connections
- **Response header allowlist**: Only forwards `content-type`, `content-length`, `date`, `x-request-id`, rate limit headers, etc.
- **Generic errors**: Never includes exception details that could leak key material
- **Connection close**: Closes after each request to prevent pipelining attacks

---

## Telemetry (opt-in, anonymous)

Primordial can send anonymous run telemetry to the index to power popularity
signals (`runs_30d`, success rate). It is **off by default** and **opt-in**:

- You are asked **once**, on your first interactive `primordial run`. Declining
  is remembered — you are never asked again.
- When enabled, two events are sent around each run: `run_start` and
  `run_complete` (with success + duration).
- Each event carries only: the agent id (`owner/repo`), the event type, a
  timestamp, success/duration on completion, and a random **`client_id`**.
- The `client_id` is a random UUID generated once and stored locally. It is
  used only for dedup/abuse-limiting — never identity. **No PII is ever sent.**

Manage it at any time:

```bash
# Telemetry is stored in your Primordial config (config.json) under "telemetry".
# Disable / re-enable by editing that file or via the prompt on next run.
```

Ratings (`primordial rate <agent> <1-5>`) are separate: they require a GitHub
token (`gh auth login` or `GH_TOKEN`) so the index can record one rating per
user per agent. Your token is sent to the index only to verify your GitHub
login; it is not stored by the client.

### Local dev mode is NOT sandboxed

`primordial dev` runs an agent **locally** for development — there is no E2B
sandbox. It lints the manifest and warns about declared network/filesystem
permissions, but it does **not** enforce them: the agent runs with your user's
privileges and can reach any host. Use `primordial run` (E2B) for anything you
do not fully trust.
