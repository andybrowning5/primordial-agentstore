# Primordial AgentStore — Security Architecture

Primordial runs untrusted agent code inside isolated Firecracker microVMs. This document describes every layer of security, from VM isolation to API key protection.

## Threat Model

An agent is arbitrary code downloaded from a public registry. It may attempt to:

- Read API keys from environment variables or process memory
- Exfiltrate secrets over the network
- Escalate privileges within the sandbox
- Access files or network resources beyond what it declared
- Tamper with other agents in a delegation chain

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

- **Package registries** — when a `setup_command` is declared, `pypi.org`, `registry.npmjs.org`, `github.com`, etc. are auto-allowed so `pip install` and `npm install` work.
- **API provider domains** — for each `keys:` entry, the provider's known API domain is auto-allowed (e.g. `api.anthropic.com` for `anthropic`).

## 3. API Key Protection — In-Sandbox Reverse Proxy

This is the core security mechanism. The problem: agents need API keys to call LLMs, but exposing the real key bytes to untrusted code means a malicious agent can steal them via `os.environ`.

**Solution:** A reverse proxy runs as `root` inside the VM. The agent gets a placeholder token and a localhost URL. The proxy swaps the placeholder for the real key on every request.

```
Agent process (user)                    Proxy (root)                     Upstream
┌──────────────────────┐    HTTP     ┌──────────────────┐    HTTPS    ┌──────────────┐
│ ANTHROPIC_API_KEY=   │───────────→ │ Strips fake key  │──────────→ │              │
│   "sess-abc123..."   │ :9001      │ Injects real key │            │ Anthropic    │
│ ANTHROPIC_BASE_URL=  │            │ Forwards to      │            │ API          │
│   http://127.0.0.1:  │  ←─────────│   upstream       │ ←──────────│              │
│   9001               │            └──────────────────┘            └──────────────┘
└──────────────────────┘
```

**How it works step by step:**

1. **Generate session token** — `sess-{secrets.token_hex(16)}` (128-bit random, one per session)
2. **Build routes** — each provider gets a localhost port (9001, 9002, ...)
3. **Upload proxy script** — written to `/opt/_primordial_proxy.py` as root, `chmod 700`
4. **Start proxy as root** — config (including real keys) sent via stdin, never on disk or CLI args
5. **Wait for proxy to bind** — socket poll confirms proxy is listening before agent starts
6. **Harden the VM** — remove sudo, hide processes (see Section 5)
7. **Start agent with overrides** — a bash wrapper exports placeholder env vars:
   ```bash
   export ANTHROPIC_API_KEY='sess-abc123...'
   export ANTHROPIC_BASE_URL='http://127.0.0.1:9001'
   cd /home/user/agent && exec python3 main.py
   ```

The agent's SDK reads `ANTHROPIC_BASE_URL`, sends requests to the local proxy, and the proxy transparently injects the real key. From the agent's perspective, normal SDK calls "just work."

**Proxy internals** (`proxy_script.py`):

- Stdlib only — `http.server`, `http.client`, `ssl`, `json`. Zero third-party dependencies.
- Strips all auth headers (`x-api-key`, `Authorization`) from incoming requests before forwarding
- Injects real key based on provider auth style (`x-api-key` for Anthropic, `Bearer` for OpenAI/others)
- Validates upstream TLS certificates via `ssl.create_default_context()` (system trust store)
- Streams responses chunk-by-chunk (8KB) with flush — critical for SSE/LLM streaming
- HTTP/1.1 with `Connection: close` — compatible with httpx (Anthropic SDK) and urllib
- One `ThreadingHTTPServer` per provider, each on a separate port

**Supported providers (auto-configured):**

| Provider | Domain | Auth Style |
|----------|--------|-----------|
| Anthropic | api.anthropic.com | `x-api-key` header |
| OpenAI | api.openai.com | `Authorization: Bearer` |
| Google | generativelanguage.googleapis.com | `Authorization: Bearer` |
| Groq | api.groq.com | `Authorization: Bearer` |
| Mistral | api.mistral.ai | `Authorization: Bearer` |
| DeepSeek | api.deepseek.com | `Authorization: Bearer` |
| Brave | api.search.brave.com | `Authorization: Bearer` |

Custom providers can specify `domain`, `base_url_env`, and `auth_style` in the manifest's `keys:` section.

## 4. Key Vault — Encrypted At Rest

API keys are stored locally in an encrypted vault file, never sent to any server.

**Location:** `~/.local/share/primordial/keys.enc` (Linux) or `~/Library/Application Support/primordial/keys.enc` (macOS), with `chmod 0600`.

**Encryption:**

| Parameter | Value |
|-----------|-------|
| Algorithm | Fernet (AES-128-CBC + HMAC-SHA256) |
| KDF | PBKDF2-HMAC-SHA256, 600,000 iterations |
| Salt | 16 bytes, `os.urandom`, generated once per vault |
| Key material | `{machine_id}:{optional_password}` |

**Machine binding:** The encryption key is derived from a hardware identifier unique to the machine:

- **macOS:** `IOPlatformUUID` from `ioreg`
- **Linux:** `/etc/machine-id`
- **Fallback:** hostname + MAC address

Copying the vault file to another machine produces a decryption error. This prevents stolen vault files from being useful without the original hardware.

**Key scoping at injection time:**

Only keys for providers the manifest explicitly declares are injected into the sandbox. An agent requesting `anthropic` will never receive your `openai` key, even if both are stored in the vault.

```python
allowed_providers = [kr.provider for kr in manifest.keys]
env_vars = vault.get_env_vars(providers=allowed_providers)
```

## 5. Sandbox Hardening

After the proxy starts but before the agent launches, the VM is hardened:

```bash
# Remove privilege escalation binaries
chmod o-rx /usr/bin/sudo /usr/bin/su /usr/sbin/su

# Remove user from sudo group
deluser user sudo

# Hide other users' processes in /proc
mount -o remount,hidepid=2 /proc
```

**What each measure prevents:**

| Hardening | Threat Mitigated |
|-----------|-----------------|
| `chmod o-rx` on sudo/su | Agent can't escalate to root |
| `deluser user sudo` | Belt-and-suspenders for sudo removal |
| `hidepid=2` on /proc | Agent can't see root-owned processes — can't read `/proc/<proxy_pid>/environ`, `/proc/<proxy_pid>/cmdline`, or memory maps |

With all three measures combined, the agent process cannot:
- Read the proxy script on disk (root-owned, mode 700)
- See the proxy process in `/proc` (hidepid=2)
- Read the proxy's environment variables (hidepid=2)
- Escalate to root to bypass any of the above (no sudo/su)
- Signal or kill the root-owned proxy process

## 6. Permission Model and User Consent

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

The `--yes` flag skips this for automation but is never used without explicit user intent.

### Delegation Isolation

When an agent delegates to a sub-agent, the sub-agent runs in its own fresh sandbox with its own manifest-derived permissions. A parent agent cannot override or escalate a sub-agent's permissions.

## 7. Security Boundaries Summary

```
┌─ User's Machine ──────────────────────────────────────────────┐
│                                                                │
│  Key Vault (AES-128, machine-bound)                           │
│  ┌──────────────────────────┐                                 │
│  │ keys.enc (chmod 0600)    │                                 │
│  └──────────┬───────────────┘                                 │
│             │ decrypt, scope to manifest                      │
│             ▼                                                  │
│  Primordial CLI                                               │
│  ┌──────────────────────────┐                                 │
│  │ Permission display       │                                 │
│  │ User approval gate       │──── "Approve and run? [y/N]"   │
│  └──────────┬───────────────┘                                 │
│             │                                                  │
└─────────────┼──────────────────────────────────────────────────┘
              │ E2B API (creates VM)
              ▼
┌─ E2B Firecracker microVM ─────────────────────────────────────┐
│                                                                │
│  Network: deny 0.0.0.0/0, allow [declared domains]           │
│                                                                │
│  ┌─ root ──────────────────────────────────────┐              │
│  │ Reverse proxy (port 9001+)                  │              │
│  │  - Real API keys in memory only             │──→ upstream  │
│  │  - Script: chmod 700, /opt/                 │    (HTTPS)   │
│  │  - Config via stdin (never on disk)         │              │
│  └─────────────────────────────────────────────┘              │
│    ↑ HTTP (localhost only)          hidepid=2                 │
│  ┌─ user ──────────────────────────────────────┐ no sudo/su  │
│  │ Agent process                               │              │
│  │  - Sees: sess-<placeholder> as API key      │              │
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
| Encrypted vault + machine binding | API key secrecy at rest | AES-128 + PBKDF2 + hardware ID |
| Key scoping | Minimal key disclosure per agent | Manifest filtering in CLI |
| Permission display + approval | Informed user consent | CLI approval gate |
| Sandbox hardening | Privilege escalation prevention | chmod, deluser, hidepid=2 |
| Delegation isolation | Cross-agent privilege boundaries | Separate VMs per sub-agent |
