"""CLI command: run an agent LOCALLY for development with hot-reload.

`primordial dev` runs an agent's run_command directly on your machine — NOT in
an E2B sandbox. It exists for fast iteration: it injects API keys from your
local vault, lints the manifest + permissions, hot-reloads on file changes, and
gives you a plain chat loop over the agent's NDJSON protocol.

SECURITY — read this:
  Local mode does NOT sandbox. There is no network firewall, no filesystem
  isolation, and no API-key proxy. The agent runs with your user's full
  privileges and can reach any network host and read/write your files. The
  manifest's `permissions.network` allowlist is LINTED and WARNED about, but it
  is NOT enforced. Use `primordial run` (E2B) for anything you do not fully
  trust. `dev` is for developing YOUR OWN agent.
"""

from __future__ import annotations

import json
import os
import shlex
import signal
import subprocess
import threading
import uuid
from pathlib import Path

import click
from rich.console import Console

from primordial.config import get_config
from primordial.manifest import load_manifest
from primordial.security.key_vault import KeyVault

console = Console()


def _lint_manifest(agent_dir: Path):
    """Load + validate the manifest; return it. Exits on hard errors."""
    try:
        manifest = load_manifest(agent_dir)
    except (FileNotFoundError, ValueError) as e:
        console.print(f"[red]Manifest invalid:[/red] {e}")
        raise SystemExit(1)
    console.print(f"[green]Manifest OK[/green] — {manifest.display_name} v{manifest.version}")
    return manifest


def _lint_permissions(manifest) -> None:
    """Warn about permission settings that local mode cannot enforce."""
    perms = manifest.permissions
    console.print("[bold]Permissions (lint only — NOT enforced locally):[/bold]")

    if perms.network_unrestricted:
        console.print("  [yellow]network: UNRESTRICTED[/yellow] — full internet (no firewall locally)")
    elif perms.network:
        console.print("  network allowlist (enforced only in E2B):")
        for net in perms.network:
            console.print(f"    [dim]- {net.domain}: {net.reason}[/dim]")
        console.print(
            "  [yellow]Warning:[/yellow] locally the agent can reach ANY domain, "
            "not just the ones above. Undeclared traffic will NOT be blocked."
        )
    else:
        console.print(
            "  [yellow]No network declared[/yellow] — in E2B this means fully "
            "isolated; locally there is no such isolation."
        )

    console.print(f"  filesystem.workspace: {perms.filesystem.workspace}")
    if perms.delegation.enabled:
        console.print("  [yellow]delegation: ENABLED[/yellow] — not supported in local dev mode")

    # Lint key requirements / unknown providers.
    try:
        from primordial.known_providers import KNOWN_PROVIDERS
    except ImportError:
        KNOWN_PROVIDERS = {}
    unknown = [k for k in manifest.keys if k.provider not in KNOWN_PROVIDERS]
    if unknown:
        console.print("  [yellow]Non-whitelisted providers:[/yellow]")
        for k in unknown:
            console.print(f"    [dim]- {k.provider}: {k.resolved_domain}[/dim]")


def _collect_env(manifest, workspace: Path | None) -> dict:
    """Build the local environment: real keys from the vault + WORKSPACE.

    Unlike E2B mode there is no proxy: keys are injected directly under their
    declared env var names so the agent can call providers from your machine.
    """
    config = get_config()
    vault = KeyVault(config.keys_file)

    env = dict(os.environ)
    providers = [k.provider for k in manifest.keys] or [manifest.runtime.default_provider]
    keys = vault.get_env_vars(providers=providers)
    missing = []
    for k in manifest.keys:
        env_name = k.resolved_env_var()
        val = keys.get(env_name)
        if val:
            env[env_name] = val
        elif k.required:
            missing.append(k.provider)
    if missing:
        console.print(
            f"[yellow]Missing keys for:[/yellow] {', '.join(missing)} "
            f"[dim](add with: primordial keys add <provider>)[/dim]"
        )

    if workspace:
        env["WORKSPACE"] = str(workspace)
    return env


class _LocalAgent:
    """Runs the agent run_command locally and speaks its NDJSON protocol."""

    def __init__(self, agent_dir: Path, manifest, env: dict):
        self._agent_dir = agent_dir
        self._manifest = manifest
        self._env = env
        self._proc: subprocess.Popen | None = None

    def start(self) -> None:
        cmd = self._manifest.runtime.run_command
        self._proc = subprocess.Popen(
            shlex.split(cmd),
            cwd=str(self._agent_dir),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=self._env,
            text=True,
            bufsize=1,
        )

        # Surface stderr so developers see tracebacks.
        def _pump_stderr():
            assert self._proc and self._proc.stderr
            for line in self._proc.stderr:
                console.print(f"[dim red]{line.rstrip()}[/dim red]")

        threading.Thread(target=_pump_stderr, daemon=True).start()

    @property
    def alive(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    def send(self, content: str) -> None:
        if not (self._proc and self._proc.stdin):
            return
        msg = {"type": "message", "content": content, "message_id": f"dev-{uuid.uuid4().hex[:8]}"}
        self._proc.stdin.write(json.dumps(msg) + "\n")
        self._proc.stdin.flush()

    def read_until_done(self) -> None:
        if not (self._proc and self._proc.stdout):
            return
        for line in self._proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                console.print(f"[dim]{line}[/dim]")
                continue
            t = msg.get("type")
            if t == "activity":
                console.print(f"  [dim]> {msg.get('tool', '?')}: {msg.get('description', '')}[/dim]")
            elif t == "response":
                content = msg.get("content", "")
                if content:
                    console.print(content)
                if msg.get("done"):
                    return
            elif t == "error":
                console.print(f"  [red]Error: {msg.get('error', 'unknown')}[/red]")
                return

    def wait_ready(self, timeout: float = 30.0) -> bool:
        """Drain until the agent emits a ready signal."""
        if not (self._proc and self._proc.stdout):
            return False
        import time as _t
        deadline = _t.monotonic() + timeout
        while _t.monotonic() < deadline and self.alive:
            line = self._proc.stdout.readline()
            if not line:
                break
            try:
                if json.loads(line.strip()).get("type") == "ready":
                    return True
            except json.JSONDecodeError:
                continue
        return False

    def stop(self) -> None:
        if self._proc and self.alive:
            try:
                if self._proc.stdin:
                    self._proc.stdin.write(json.dumps({"type": "shutdown"}) + "\n")
                    self._proc.stdin.flush()
                self._proc.wait(timeout=3)
            except Exception:
                try:
                    self._proc.send_signal(signal.SIGTERM)
                except Exception:
                    pass


@click.command()
@click.argument("agent_path", default=".")
@click.option("--workspace", "workspace_path", default=None, type=click.Path(exists=True),
              help="Directory to expose as WORKSPACE (defaults to the current directory).")
@click.option("--reload/--no-reload", default=True, show_default=True,
              help="Restart the agent when files in the agent directory change.")
def dev(agent_path: str, workspace_path: str | None, reload: bool):
    """Run an agent LOCALLY (not E2B) for development, with hot-reload.

    AGENT_PATH defaults to the current directory. This injects keys from your
    vault and lints the manifest + permissions, but it does NOT sandbox: there
    is no network firewall, no filesystem isolation, and no key proxy. Use
    `primordial run` for untrusted agents.
    """
    agent_dir = Path(agent_path).resolve()
    if not agent_dir.is_dir():
        console.print(f"[red]Not a directory:[/red] {agent_dir}")
        raise SystemExit(1)

    console.print(
        "[bold yellow]LOCAL DEV MODE — no sandbox.[/bold yellow] "
        "[dim]Network/filesystem permissions are linted but NOT enforced. "
        "Keys are injected directly (no proxy).[/dim]\n"
    )

    manifest = _lint_manifest(agent_dir)
    _lint_permissions(manifest)
    console.print()

    workspace = Path(workspace_path).resolve() if workspace_path else Path.cwd()
    env = _collect_env(manifest, workspace)

    agent = _LocalAgent(agent_dir, manifest, env)
    agent.start()
    if not agent.wait_ready(timeout=30):
        console.print("[red]Agent did not signal ready.[/red]")
        agent.stop()
        raise SystemExit(1)
    console.print(f"[green]{manifest.display_name} ready[/green] [dim](local)[/dim]\n")

    reloader_stop = threading.Event()
    if reload:
        _start_reloader(agent_dir, agent, env, manifest, reloader_stop)

    try:
        while True:
            try:
                user_input = console.input("[bold]dev> [/bold]")
            except (EOFError, KeyboardInterrupt):
                break
            if user_input.strip().lower() in ("exit", "quit", "/exit", "/quit"):
                break
            if not user_input.strip():
                continue
            if not agent.alive:
                console.print("[red]Agent process exited.[/red]")
                break
            agent.send(user_input)
            agent.read_until_done()
    finally:
        reloader_stop.set()
        agent.stop()
        console.print("[dim]Dev session ended.[/dim]")


def _start_reloader(agent_dir: Path, agent: _LocalAgent, env: dict, manifest, stop: threading.Event) -> None:
    """Watch the agent directory and restart the agent process on change."""
    try:
        from watchfiles import watch
    except ImportError:
        console.print("[dim]watchfiles not available — hot-reload disabled.[/dim]")
        return

    def _watch():
        for _changes in watch(str(agent_dir), stop_event=stop):
            console.print("\n[dim]Change detected — reloading agent...[/dim]")
            agent.stop()
            try:
                new_manifest = load_manifest(agent_dir)
            except (FileNotFoundError, ValueError) as e:
                console.print(f"[red]Manifest invalid, keeping old process:[/red] {e}")
                new_manifest = manifest
            agent._manifest = new_manifest
            agent.start()
            if agent.wait_ready(timeout=30):
                console.print("[green]Reloaded.[/green]")
            else:
                console.print("[red]Agent did not signal ready after reload.[/red]")

    threading.Thread(target=_watch, daemon=True).start()
