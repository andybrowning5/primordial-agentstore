# The Primordial Daemon

When Claude Code or OpenClaw uses Primordial, they talk to a small background service running on your machine called the **daemon**. It manages agent sandboxes so you don't have to.

## What it does

- Listens on `localhost:19400` — only your machine can reach it
- Starts and stops agent sandboxes on demand
- Handles API key injection so agents never see your raw keys
- Authenticates requests with a token file so other processes can't use it

## How it gets installed

When you run `primordial install`, it sets up the daemon to start automatically on login using macOS launchd. You may see a prompt to install **Xcode Command Line Tools** — agree to install them if asked.

After install, the daemon runs in the background. You don't need to start it manually.

## Files on your machine

| File | Purpose |
|------|---------|
| `~/Library/LaunchAgents/com.primordial.daemon.plist` | Tells macOS to start the daemon on login and restart it if it crashes |
| `~/.local/bin/primordial` | Wrapper script that unlocks your key vault before running commands |
| `~/.primordial-password` | Your vault encryption password (auto-generated, never leave your machine) |
| `~/.primordial-daemon-token` | Auth token for the current daemon session (regenerated each time it starts) |
| `/tmp/primordial-daemon.log` | Daemon log output |

All sensitive files (`-password`, `-daemon-token`) are readable only by your user account.

## Checking if it's running

```bash
curl -s http://localhost:19400/health
```

If you get back `{"ok": true, ...}`, it's running. If the connection is refused, it's not.

## Restarting the daemon

```bash
launchctl stop com.primordial.daemon
launchctl start com.primordial.daemon
```

Or just re-run `primordial install` — it's safe to run multiple times.

## Viewing logs

```bash
cat /tmp/primordial-daemon.log
```

Or follow live:

```bash
tail -f /tmp/primordial-daemon.log
```

## Stopping the daemon permanently

```bash
launchctl unload ~/Library/LaunchAgents/com.primordial.daemon.plist
```

This stops it and prevents it from starting on login. Run `primordial install` again to re-enable it.

## Linux

On Linux, launchd isn't available. You'll need to run `primordial serve` manually or set up a systemd service. The daemon works the same way — just the auto-start mechanism differs.
