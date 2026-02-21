# Changelog

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
