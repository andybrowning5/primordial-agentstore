"""Primordial daemon — Unix socket server that holds vault keys in memory.

Keys never cross the socket. Clients request actions (run, search);
the daemon executes them internally and streams back results.
"""

from __future__ import annotations

import json
import os
import signal
import socket
import sys
import threading
import uuid
from pathlib import Path

import click
from rich.console import Console

from primordial.config import get_config, get_data_dir
from primordial.daemon import SOCKET_NAME
from primordial.security.key_vault import KeyVault

console = Console()


def _send(conn: socket.socket, obj: dict) -> None:
    conn.sendall(json.dumps(obj).encode() + b"\n")


def _handle_ping(conn: socket.socket, _req: dict, _vault: KeyVault) -> None:
    _send(conn, {"ok": True})


def _handle_keys_list(conn: socket.socket, _req: dict, vault: KeyVault) -> None:
    entries = vault.list_keys()
    _send(conn, {"ok": True, "keys": entries})


def _handle_search(conn: socket.socket, req: dict, _vault: KeyVault) -> None:
    from primordial.cli.search import _fetch_results

    query = req.get("query")
    try:
        repos = _fetch_results(query)
        compact = [
            {
                "name": r["full_name"],
                "description": r.get("description") or "",
                "url": r["html_url"],
                "stars": r.get("stargazers_count", 0),
            }
            for r in repos
        ]
        _send(conn, {"ok": True, "results": compact})
    except Exception as e:
        _send(conn, {"ok": False, "error": str(e)})


def _handle_run(conn: socket.socket, req: dict, vault: KeyVault) -> None:
    """Run an agent and stream NDJSON messages back over the socket."""
    from primordial.github import GitHubResolver, GitHubResolverError, is_github_url, parse_github_url
    from primordial.manifest import load_manifest
    from primordial.sandbox.manager import SandboxManager

    config = get_config()
    agent_path = req.get("agent", "")
    ref = req.get("ref")
    session_name = req.get("session")

    # Resolve agent path
    if is_github_url(agent_path):
        try:
            github_ref = parse_github_url(agent_path, ref_override=ref)
            resolver = GitHubResolver()
            agent_dir = resolver.resolve(github_ref, force_refresh=req.get("refresh", False))
        except GitHubResolverError as e:
            _send(conn, {"type": "error", "error": f"GitHub resolve failed: {e}"})
            _send(conn, {"type": "done"})
            return
    else:
        agent_dir = Path(agent_path)
        if not agent_dir.exists():
            installed = config.agents_dir / agent_path
            if installed.exists():
                agent_dir = installed
            else:
                _send(conn, {"type": "error", "error": f"Agent not found: {agent_path}"})
                _send(conn, {"type": "done"})
                return

    # Load manifest
    try:
        manifest = load_manifest(agent_dir)
    except (FileNotFoundError, ValueError) as e:
        _send(conn, {"type": "error", "error": f"Invalid agent: {e}"})
        _send(conn, {"type": "done"})
        return

    # Session
    session_name = session_name or f"daemon-{uuid.uuid4().hex[:8]}"
    state_dir = config.session_state_dir(manifest.name, session_name)

    # Build env vars from vault — keys stay in this process
    if manifest.keys:
        allowed_providers = [kr.provider for kr in manifest.keys]
    else:
        allowed_providers = [manifest.runtime.default_model.provider]
    allowed_providers.append("e2b")
    env_vars = vault.get_env_vars(providers=allowed_providers)

    # Check for missing required keys
    if not env_vars.get("E2B_API_KEY"):
        _send(conn, {"type": "error", "error": "Missing E2B API key. Run: primordial keys add e2b"})
        _send(conn, {"type": "done"})
        return

    if manifest.keys:
        for kr in manifest.keys:
            env_name = kr.resolved_env_var()
            if kr.required and not env_vars.get(env_name):
                _send(conn, {"type": "error", "error": f"Missing required key: {kr.provider}. Run: primordial keys add {kr.provider}"})
                _send(conn, {"type": "done"})
                return

    # Run agent
    manager = SandboxManager()
    try:
        session = manager.run_agent(
            agent_dir=agent_dir,
            manifest=manifest,
            workspace=Path(".").resolve(),
            env_vars=env_vars,
            state_dir=state_dir,
        )
    except Exception as e:
        _send(conn, {"type": "error", "error": f"Failed to start agent: {e}"})
        _send(conn, {"type": "done"})
        return

    if not session.wait_ready(timeout=120):
        _send(conn, {"type": "error", "error": "Agent failed to start"})
        _send(conn, {"type": "done"})
        session.shutdown()
        return

    _send(conn, {"type": "ready"})

    # Relay messages from stdin on socket to agent, and agent responses back
    conn.settimeout(0.1)
    buf = b""
    try:
        while session.is_alive:
            # Check for incoming messages from client
            try:
                chunk = conn.recv(4096)
                if not chunk:
                    break
                buf += chunk
                while b"\n" in buf:
                    line, buf = buf.split(b"\n", 1)
                    if line.strip():
                        incoming = json.loads(line.decode())
                        if incoming.get("type") == "shutdown":
                            session.shutdown()
                            _send(conn, {"type": "done"})
                            return
                        if incoming.get("type") == "message":
                            content = incoming.get("content", "")
                            msg_id = incoming.get("message_id", f"auto_{uuid.uuid4().hex[:8]}")
                            session.send_message(content, msg_id)
            except socket.timeout:
                pass

            # Relay agent responses to client
            msg = session.receive(timeout=0.1)
            if msg is not None:
                _send(conn, msg)
                if msg.get("type") == "response" and msg.get("done", False):
                    pass  # Keep connection open for more messages
                if msg.get("type") == "error":
                    pass
    finally:
        session.shutdown()
        _send(conn, {"type": "done"})


_HANDLERS = {
    "ping": _handle_ping,
    "search": _handle_search,
    "keys.list": _handle_keys_list,
    "run": _handle_run,
}


def _handle_connection(conn: socket.socket, vault: KeyVault) -> None:
    """Handle a single client connection."""
    try:
        conn.settimeout(300)
        buf = b""
        while True:
            chunk = conn.recv(4096)
            if not chunk:
                break
            buf += chunk
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                if not line.strip():
                    continue
                try:
                    req = json.loads(line.decode())
                except json.JSONDecodeError:
                    _send(conn, {"ok": False, "error": "Invalid JSON"})
                    continue
                method = req.get("method", "")
                handler = _HANDLERS.get(method)
                if handler:
                    handler(conn, req, vault)
                else:
                    _send(conn, {"ok": False, "error": f"Unknown method: {method}"})
                # For non-streaming methods, we're done after one request
                if method != "run":
                    return
    except (OSError, BrokenPipeError):
        pass
    finally:
        conn.close()


@click.command()
def serve():
    """Start the Primordial daemon (holds vault keys, serves actions over Unix socket)."""
    config = get_config()
    vault = KeyVault(config.keys_file)

    # Verify vault is accessible before starting
    try:
        vault.list_keys()
    except Exception as e:
        console.print(f"[red]Cannot access vault:[/red] {e}")
        raise SystemExit(1)

    sock_path = get_data_dir() / SOCKET_NAME

    # Clean up stale socket
    if sock_path.exists():
        try:
            os.unlink(str(sock_path))
        except OSError:
            console.print(f"[red]Cannot remove stale socket:[/red] {sock_path}")
            raise SystemExit(1)

    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(str(sock_path))
    os.chmod(str(sock_path), 0o600)
    server.listen(4)
    server.settimeout(1.0)  # So we can check for shutdown signal

    shutdown = threading.Event()

    def _cleanup(*_):
        shutdown.set()

    signal.signal(signal.SIGINT, _cleanup)
    signal.signal(signal.SIGTERM, _cleanup)

    console.print(f"[green]Primordial daemon listening[/green] on {sock_path}")
    console.print("[dim]Keys are held in memory. Press Ctrl+C to stop.[/dim]")

    try:
        while not shutdown.is_set():
            try:
                conn, _ = server.accept()
            except socket.timeout:
                continue
            t = threading.Thread(target=_handle_connection, args=(conn, vault), daemon=True)
            t.start()
    finally:
        server.close()
        try:
            os.unlink(str(sock_path))
        except OSError:
            pass
        console.print("\n[dim]Daemon stopped.[/dim]")
