# Primordial AgentStore — Security Architecture

Primordial runs untrusted agent code inside isolated Firecracker microVMs. This document describes every layer of security, from VM isolation to API key protection.

## Threat Model

An agent is arbitrary code downloaded from a public registry. It may attempt to:

- Read API keys from environment variables or process memory
- Exfiltrate secrets over the network
- Escalate privileges within the sandbox
- Access files or network resources beyond what it declared
- Tamper with other agents in a delegation chain
- Hijack proxy routes via malicious manifest declarations
- Persist malicious files across sessions

Primordial assumes agents are hostile and applies defense-in-depth at every layer.

---

## 1. Sandbox Isolation — Firecracker microVMs

Every agent runs in a fresh [E2B](https://e2b.dev) Firecracker microVM. Each invocation creates a new VM from scratch — VMs are never reused across sessions. The VM is explicitly killed after the agent session ends.

Agents run as the unprivileged `user` account. Platform operations (proxy, hardening) run as `root` before the agent process starts.

```
/home/user/           ← agent's home directory
/home/user/agent/     ← agent code (uploaded at start)
/home/user/workspace/ ← working directory
```

## 2. Network Isolation

Network policy is enforced at the hypervisor level by E2B's infrastructure, not inside the VM. The agent cannot bypass it.

**Three modes, determined by the agent manifest:**

| Mode | Manifest Config | Behavior |
|------|----------------|----------|
| Allowlist | `network: [{domain: "api.example.com", ...}]` | Deny all, allow listed domains |
| Unrestricted | `network_unrestricted: true` | Full internet access |
| Isolated | No network config | Deny all outbound traffic |

**Allowlist mode** (the default when domains are declared) works by denying `0.0.0.0/0` then allowing specific domains:

```python
{"network": {"deny_out": ["0.0.0.0/0"], "allow_out": ["api.anthropic.com", ...]}}
```

**Auto-allowed domains:**

- **Package registries** — when a `setup_command` is declared, `pypi.org`, `files.pythonhosted.org`, `registry.npmjs.org`, `registry.yarnpkg.com`, and `nodejs.org` are auto-allowed so `pip install` and `npm install` work.
- **Known API provider domains** — for each `keys:` entry with a known provider, the provider's hardcoded API domain is auto-allowed (e.g. `api.anthropic.com` for `anthropic`). Custom domains from unknown providers are NOT auto-allowed.

**Domain validation:**

- Must be a valid FQDN with at least one dot (rejects single-label hosts like `localhost`)
- Must contain at least one letter (rejects IP literals like `169.254.169.254`)
- Validated by regex at manifest parse time

## 3. API Key Protection — In-Sandbox Reverse Proxy

This is the core security mechanism. The problem: agents need API keys to call LLMs, but exposing the real key bytes to untrusted code means a malicious agent can steal them via `os.environ`.

**Solution:** A reverse proxy runs as `root` inside the VM. The agent gets a session token and a localhost URL. The proxy swaps the session token for the real key on every request.

```
Agent process (user)                    Proxy (root)                     Upstream
┌──────────────────────┐    HTTP     ┌──────────────────────┐  HTTPS  ┌──────────────┐
│ ANTHROPIC_API_KEY=   │───────────→ │ Validates session    │───────→ │              │
│   "sess-abc123..."   │ :9001      │ Strips fake key      │        │ Anthropic    │
│ ANTHROPIC_BASE_URL=  │            │ Injects real key     │        │ API          │
│   http://127.0.0.1:  │  ←─────────│ Filters response hdrs│←───────│              │
│   9001               │            └──────────────────────┘        └──────────────┘
└──────────────────────┘
```

**Startup sequence (order is security-critical):**

1. **Create sandbox** — env vars filtered through allowlist (only `PATH`, `HOME`, `SHELL`, etc.)
2. **Upload agent code** — tar archive extracted into `/home/user/agent/`
3. **Restore state** — only allowlisted directories (`workspace/`, `data/`, `output/`, `state/`)
4. **Harden the VM** — remove sudo/su, hide `/proc` with `hidepid=2` (fail-closed if proxy needed)
5. **Start proxy as root** — binds ports BEFORE setup_command runs, config via stdin
6. **Run setup_command** — runs as `user` (not root), after proxy has bound its ports
7. **Start agent** — env vars injected inline with shell-escaped values

**Proxy security features** (`proxy_script.py`):

- Stdlib only — zero third-party dependencies
- Session token validated on every request (128-bit entropy, `secrets.token_hex(16)`)
- CRLF injection blocked — rejects paths containing `\r` or `\n`
- Chunked Transfer-Encoding rejected — prevents HTTP request smuggling
- Connection: close after each request — prevents pipelining attacks
- Request body capped at 100MB — prevents DoS
- Response headers filtered through safe allowlist — prevents key leakage
- Generic error messages — never includes exception details that could leak key material
- 60-second socket timeout — prevents thread exhaustion via slow connections
- Proxy script root-owned, `chmod 700` — unreadable by agent process

**Known provider domain enforcement:**

For known providers (Anthropic, OpenAI, Google, Groq, Mistral, DeepSeek, Brave), the proxy always uses the hardcoded domain from `_PROVIDER_DEFAULTS`, ignoring any `domain` override in the manifest. This prevents a malicious manifest from redirecting real API keys to attacker-controlled servers.

**Cross-provider theft prevention:**

Unknown providers cannot declare `env_var: ANTHROPIC_API_KEY` or other known provider env var names. This is enforced at runtime in `_start_proxy` to prevent an unknown provider from stealing a known provider's real key.

**Collision detection:**

Duplicate `env_var` or `base_url_env` values across manifest key entries are rejected with `SandboxError`, preventing route hijacking.

**Supported providers (auto-configured):**

| Provider | Domain | Auth Style |
|----------|--------|-----------|
| Anthropic | api.anthropic.com | `x-api-key` header |
| OpenAI | api.openai.com | `Authorization: Bearer` |
| Google | generativelanguage.googleapis.com | `Authorization: Bearer` |
| Groq | api.groq.com | `Authorization: Bearer` |
| Mistral | api.mistral.ai | `Authorization: Bearer` |
| DeepSeek | api.deepseek.com | `Authorization: Bearer` |

Custom providers can specify `domain`, `base_url_env`, and `auth_style` (any HTTP header name) in the manifest's `keys:` section. See [Custom Providers](custom-providers.md).

## 4. Key Vault — Encrypted At Rest

API keys are stored locally in an encrypted vault file, never sent to any server.

**Location:** `~/.local/share/primordial/keys.enc` (Linux) or `~/Library/Application Support/primordial/keys.enc` (macOS), with `chmod 0600`. Parent directory enforced at `0700`.

**Encryption:**

| Parameter | Value |
|-----------|-------|
| Algorithm | Fernet (AES-128-CBC + HMAC-SHA256) |
| KDF | PBKDF2-HMAC-SHA256, 600,000 iterations |
| Salt | 16 bytes, `os.urandom`, generated once per vault |
| Key material | `{machine_id}:{keychain_secret}:{password}` |

**Three-factor key derivation:**

1. **Machine ID** — hardware-specific identifier (`IOPlatformUUID` on macOS, `/etc/machine-id` on Linux)
2. **Keychain secret** — 32-byte random value stored in macOS Keychain (with `-T ""` ACL requiring user approval) or a `0600` file on Linux
3. **User password** — optional additional factor via `PRIMORDIAL_VAULT_PASSWORD`

Copying the vault file to another machine produces a decryption error. This prevents stolen vault files from being useful without the original hardware.

**File security:**

- Vault file permissions checked on every read — refuses to load if not `0600`
- Linux secret file permissions checked on every read — refuses if not `0600`
- Atomic vault writes via temp file + `os.replace()` — prevents corruption and brief world-readable windows
- Temp file created with `O_NOFOLLOW` — prevents symlink attacks
- Linux secret file created atomically with `O_CREAT | O_EXCL` at `0600` — prevents TOCTOU races
- macOS keychain secret passed via `-X` hex encoding — never exposed in process arguments

**macOS Keychain hardening:**

- Secret stored with `-T ""` ACL flag — requires user approval for any process to access
- No silent fallback — if Keychain is unavailable, raises `RuntimeError` instead of downgrading to file-based storage

**Key scoping at injection time:**

Only keys for providers the manifest explicitly declares are injected into the sandbox. An agent requesting `anthropic` will never receive your `openai` key, even if both are stored in the vault.

## 5. Sandbox Hardening

Hardening is applied BEFORE the proxy starts and BEFORE any agent-controlled code (including `setup_command`) runs:

```bash
# Remove privilege escalation binaries
chmod o-rx /usr/bin/sudo /usr/bin/su /usr/sbin/su

# Remove user from sudo group
deluser user sudo

# Hide other users' processes in /proc (fail-closed if proxy is needed)
mount -o remount,hidepid=2 /proc
```

**Fail-closed behavior:** If `hidepid=2` cannot be applied and the agent requires API keys (proxy needed), sandbox creation aborts with `SandboxError`. The proxy will NOT start with `/proc` exposed.

**What each measure prevents:**

| Hardening | Threat Mitigated |
|-----------|-----------------|
| `chmod o-rx` on sudo/su | Agent can't escalate to root |
| `deluser user sudo` | Belt-and-suspenders for sudo removal |
| `hidepid=2` on /proc | Agent can't see root-owned processes — can't read `/proc/<proxy_pid>/environ`, `/proc/<proxy_pid>/cmdline`, or memory maps |
| `setup_command` as `user` | Setup can't escalate privileges or plant root-owned files |
| Proxy binds before setup | Setup can't pre-bind proxy ports to intercept traffic |

With all measures combined, the agent process cannot:
- Read the proxy script on disk (root-owned, mode 700)
- See the proxy process in `/proc` (hidepid=2)
- Read the proxy's environment variables (hidepid=2)
- Escalate to root to bypass any of the above (no sudo/su)
- Signal or kill the root-owned proxy process
- Pre-bind proxy ports during setup (proxy starts first)

## 6. Manifest Validation

Agent manifests are validated at parse time with strict field validators:

**Provider names:** `^[a-z][a-z0-9-]*$` — lowercase letters, numbers, hyphens only. No underscores (prevents `resolved_env_var()` collisions).

**Env var names:** `^[A-Z][A-Z0-9_]*$` — checked against `_PROTECTED_ENV_VARS` to prevent clobbering system variables (`PATH`, `LD_PRELOAD`, etc.) or known provider variables (`ANTHROPIC_BASE_URL`, etc.).

**Domain names:** Must be valid FQDN with at least one dot and at least one letter. Rejects IP literals, single-label hosts, and double-dot hostnames.

**Auth style:** Any valid HTTP header name (`^[a-z][a-z0-9-]*$`).

**Sandbox template:** Must be `"base"` (allowlist of one).

**Runtime checks in `_start_proxy`:**
- Auto-generated `base_url_env` rechecked against protected vars (for unknown providers only)
- Duplicate `env_var` and `base_url_env` detection across all key entries
- Unknown providers blocked from using known provider env var names

## 7. State Persistence Security

Agent state is saved/restored between sessions using an **allowlist** approach:

```python
_STATE_ALLOW_DIRS = ["workspace", "data", "output", "state"]
```

Only these subdirectories of `/home/user/` are persisted. Everything else — dotfiles, `.config/`, `.local/bin/`, `.ssh/`, `.gitconfig`, shell profiles — is excluded by default. This prevents:

- Dotfile poisoning (`.bashrc`, `.profile` injection)
- Config injection (`.config/pip/pip.conf` redirecting to attacker PyPI)
- Binary planting (`.local/bin/` PATH hijacking)
- SSH key theft (`.ssh/` access)

**Tar extraction safety:** State archives are extracted with `filter="data"` (Python 3.12+), which blocks path traversal (`../`) and symlink attacks. On Python < 3.12, state save aborts with `SandboxError` rather than proceeding with unsafe extraction.

## 8. Environment Variable Isolation

Environment variables passed to the sandbox use an **allowlist** approach:

```python
_SAFE_ENV_ALLOWLIST = {
    "PATH", "HOME", "USER", "SHELL", "LANG", "LC_ALL",
    "LC_CTYPE", "TERM", "TZ", "PYTHONPATH", "NODE_PATH",
}
```

Only these variables from the host environment are forwarded to `Sandbox.create()`. All others — including `AWS_ACCESS_KEY_ID`, `DATABASE_URL`, `GITHUB_TOKEN`, or any other credentials that might be in the user's shell — are silently dropped.

Real API keys are delivered exclusively through the proxy's stdin channel, never as sandbox environment variables.

## 9. Permission Model and User Consent

### Manifest Declaration

Every agent declares its permissions in `agent.yaml`:

```yaml
permissions:
  network:
    - domain: api.anthropic.com
      reason: LLM API access
  filesystem:
    workspace: readwrite
  delegation:
    enabled: false

keys:
  - provider: anthropic
    required: true
```

### User Approval

Before any sandbox is created, the user sees a formatted summary of all permissions and must explicitly approve:

```
Permissions

  Network access:
    - api.anthropic.com: LLM API access
  Workspace access:
    - readwrite
  API keys:
    - anthropic (ANTHROPIC_API_KEY): required — stored
  Resources:
    - 2GB RAM, 2 CPUs

Approve and run? [y/N]:
```

### Delegation Isolation

When an agent delegates to a sub-agent, the sub-agent runs in its own fresh sandbox with its own manifest-derived permissions. A parent agent cannot override or escalate a sub-agent's permissions.

## 10. Security Boundaries Summary

```
┌─ User's Machine ──────────────────────────────────────────────┐
│                                                                │
│  Key Vault (AES-128, machine-bound, keychain-protected)       │
│  ┌──────────────────────────┐                                 │
│  │ keys.enc (chmod 0600)    │                                 │
│  │ dir (chmod 0700)         │                                 │
│  │ atomic writes, O_NOFOLLOW│                                 │
│  └──────────┬───────────────┘                                 │
│             │ decrypt, scope to manifest                      │
│             ▼                                                  │
│  Primordial CLI                                               │
│  ┌──────────────────────────┐                                 │
│  │ Permission display       │                                 │
│  │ User approval gate       │──── "Approve and run? [y/N]"   │
│  │ Manifest validation      │                                 │
│  └──────────┬───────────────┘                                 │
│             │                                                  │
└─────────────┼──────────────────────────────────────────────────┘
              │ E2B API (creates VM)
              ▼
┌─ E2B Firecracker microVM ─────────────────────────────────────┐
│                                                                │
│  Network: deny 0.0.0.0/0, allow [declared domains]           │
│                                                                │
│  1. Harden  ─→  2. Start proxy  ─→  3. Setup  ─→  4. Agent  │
│     (root)         (root)             (user)        (user)    │
│                                                                │
│  ┌─ root ──────────────────────────────────────┐              │
│  │ Reverse proxy (port 9001+)                  │              │
│  │  - Session token auth on every request      │──→ upstream  │
│  │  - Real API keys in memory only             │    (HTTPS)   │
│  │  - Script: chmod 700, /opt/                 │              │
│  │  - Config via stdin (never on disk)         │              │
│  │  - Response headers filtered (allowlist)    │              │
│  │  - CRLF/smuggling blocked, 100MB cap        │              │
│  └─────────────────────────────────────────────┘              │
│    ↑ HTTP (localhost only)          hidepid=2                 │
│  ┌─ user ──────────────────────────────────────┐ no sudo/su  │
│  │ Agent process                               │              │
│  │  - Sees: sess-<token> as API key            │              │
│  │  - Sees: http://127.0.0.1:9001 as base URL  │              │
│  │  - Cannot: read proxy, see /proc, escalate  │              │
│  └─────────────────────────────────────────────┘              │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

| Layer | What It Protects | Enforced By |
|-------|-----------------|-------------|
| Firecracker VM | Process/filesystem isolation from host | E2B infrastructure |
| Network deny-all + allowlist | Limits exfiltration surface | E2B hypervisor (kernel-level) |
| Reverse proxy + session tokens | API key secrecy at runtime | Linux user isolation + hidepid=2 |
| Known provider domain pinning | Prevents key redirection attacks | Hardcoded `_PROVIDER_DEFAULTS` |
| Cross-provider env var guard | Prevents unknown providers stealing keys | Runtime check in `_start_proxy` |
| Encrypted vault + machine binding | API key secrecy at rest | AES-128 + PBKDF2 + keychain |
| Key scoping | Minimal key disclosure per agent | Manifest filtering in CLI |
| Permission display + approval | Informed user consent | CLI approval gate |
| Manifest validation | Input sanitization | Pydantic validators + regex |
| Sandbox hardening (fail-closed) | Privilege escalation prevention | chmod, deluser, hidepid=2 |
| State persistence allowlist | Cross-session poisoning prevention | Allowlist of 4 directories |
| Env var allowlist | Host credential leakage prevention | Allowlist of 10 safe vars |
| Delegation isolation | Cross-agent privilege boundaries | Separate VMs per sub-agent |
| Tar extraction filter | Path traversal prevention | Python 3.12 `filter="data"` |
