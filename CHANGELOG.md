# Changelog

## 0.4.0

### Added

- **Daemon mode (`primordial serve`)** — Unix socket server that holds vault keys in memory and serves actions (run, search) without exposing raw API keys. Host agents like OpenClaw delegate through the daemon automatically when it's running, with zero access to the vault or key material
  - Keys never cross the socket — only action requests and results
  - Socket permissions `0600` (same-user only)
  - Auto-delegation: `primordial run --agent` detects the daemon and proxies through it; falls back to direct vault access when no daemon is running
  - Clean shutdown on `SIGINT`/`SIGTERM`, removes socket file

## 0.3.0

### Added

- **`--agent` flag** — unified host-agent mode for `primordial search` and `primordial run`. Replaces `--json`, `--agent-read`, and `--yes` with a single flag
  - `search --agent`: JSON output for programmatic agent discovery
  - `run --agent`: interactive setup (session picker, permissions, approval) via plain stdin/stdout, then NDJSON conversation mode
  - Missing API keys produce actionable error messages instead of interactive prompts
- **Agent delegation system** — agents can discover, spawn, and interact with other agents
  - Python SDK (`primordial_delegate.py`) — stdlib-only, zero dependencies
  - Node.js SDK (`primordial_delegate.mjs`) — zero dependencies, uses built-in `net`
  - CLI tool (`delegate_cli.py`) — language-agnostic delegation via shell commands
  - Delegation proxy (`delegation_proxy.py`) — in-sandbox relay with command allowlist
  - Sub-agent activity events bubble up to parent TUI in real-time
- **Terminal passthrough mode** — raw PTY support for agents that need a full terminal (e.g., Claude Code)
- **Sub-agent spawn animation** — mini double helix with live setup status and phase timers
- **`skill.md` injection** — agents receive protocol documentation on first message

### Changed

- Removed `--agent-read`, `--yes`, and `--json` flags (replaced by `--agent`)
- Proxy session tokens use `sk-ant-` prefix for Claude Code compatibility
- Sandbox timeouts increased 10x for long-running agent operations

### Fixed

- Spinner glitch: PTY output deferred until spinner clears
- Terminal mode: inline env vars and suppress spinner artifacts
- Claude Code auth passthrough for proxied API keys

## 0.2.0

### Security

- **In-sandbox reverse proxy hardening** — session token authentication (128-bit), CRLF injection blocking, Transfer-Encoding rejection, response header allowlist, 100MB body cap, 60s socket timeout, connection close after each request
- **Manifest-declared domain pinning** — proxy enforces the domain declared in each key requirement
- **Environment variable allowlist** — only 10 known-safe env vars forwarded to sandbox (replaces denylist approach)
- **State persistence allowlist** — only `workspace/`, `data/`, `output/`, `state/` directories persisted across sessions (replaces denylist approach)
- **Sandbox hardening fail-closed** — if `hidepid=2` cannot be applied and API keys are in use, sandbox creation aborts instead of continuing with `/proc` exposed
- **Hardening before all user code** — sudo/su removal, hidepid=2, and proxy startup all happen before `setup_command` runs
- **Setup command runs as unprivileged user** — `setup_command` now explicitly runs as `user`, not root
- **Proxy starts before setup** — prevents malicious setup from pre-binding proxy ports
- **Manifest validation hardened** — domain regex rejects IP literals and single-label hosts, provider regex disallows underscores, `env_var` and `base_url_env` checked against protected system/provider variable names, duplicate env name collision detection
- **Key vault atomic writes** — vault file written via temp + rename with `O_NOFOLLOW` to prevent symlink attacks and brief world-readable windows
- **Key vault permission checks** — vault file and secret file permissions verified on every read
- **macOS keychain hex encoding** — vault secret passed via `-X` hex flag instead of CLI args to avoid process argument exposure
- **macOS keychain no silent fallback** — raises error instead of silently downgrading to file-based storage
- **Linux vault secret atomic creation** — `O_CREAT | O_EXCL` at `0600` prevents TOCTOU race
- **Safe tar extraction** — rejects absolute paths, `..` traversal, and symlinks during state restore
- **Package registry allowlist tightened** — removed `codeload.github.com` from auto-allowed domains
- **Unique /tmp paths** — sandbox temp files use `secrets.token_hex(8)` to prevent predictable path races

### Changed

- Proxy response headers now forward `content-encoding` for gzip support

## 0.1.0

Initial release.
