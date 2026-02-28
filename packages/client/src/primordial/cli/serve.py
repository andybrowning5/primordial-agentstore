"""HTTP daemon for multi-turn agent sessions.

Holds live E2B sandboxes in memory and exposes them via simple HTTP
so hosts like OpenClaw can interact without managing child processes.
"""

import json
import logging
import secrets
import uuid
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from threading import Lock

import click
from rich.console import Console

from primordial.config import get_config
from primordial.github import GitHubResolver, GitHubResolverError, is_github_url, parse_github_url
from primordial.manifest import load_manifest
from primordial.security.key_vault import KeyVault
from primordial.sandbox.manager import SandboxManager

logger = logging.getLogger(__name__)
console = Console()

DEFAULT_PORT = 19400
_TOKEN_FILE = Path.home() / ".primordial-daemon-token"


class _SessionEntry:
    __slots__ = ("session", "manifest", "agent_dir")

    def __init__(self, session, manifest, agent_dir):
        self.session = session
        self.manifest = manifest
        self.agent_dir = agent_dir


# Module-level state shared across request handlers
_sessions: dict[str, _SessionEntry] = {}
_sessions_lock = Lock()
_manager = SandboxManager()
_daemon_token: str = ""


def _generate_daemon_token() -> str:
    """Generate a random bearer token and write to ~/.primordial-daemon-token."""
    token = secrets.token_urlsafe(32)
    _TOKEN_FILE.write_text(token)
    _TOKEN_FILE.chmod(0o600)
    return token


def _read_body(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", 0))
    if length == 0:
        return {}
    return json.loads(handler.rfile.read(length))


def _respond_json(handler: BaseHTTPRequestHandler, data: dict, status: int = 200):
    body = json.dumps(data).encode()
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _respond_error(handler: BaseHTTPRequestHandler, msg: str, status: int = 400):
    _respond_json(handler, {"error": msg}, status)


def _check_auth(handler: BaseHTTPRequestHandler) -> bool:
    """Verify Bearer token. Returns True if authorized."""
    auth = handler.headers.get("Authorization", "")
    if auth == f"Bearer {_daemon_token}":
        return True
    _respond_error(handler, "Unauthorized", 401)
    return False


class DaemonHandler(BaseHTTPRequestHandler):
    """Handles /search, /run, /message, /shutdown, /health."""

    def log_message(self, fmt, *args):
        logger.info(fmt, *args)

    def do_GET(self):
        if self.path == "/health":
            with _sessions_lock:
                ids = list(_sessions.keys())
            _respond_json(self, {"ok": True, "sessions": ids})
        else:
            _respond_error(self, "Not found", 404)

    def do_POST(self):
        if not _check_auth(self):
            return

        try:
            body = _read_body(self)
        except Exception as e:
            _respond_error(self, f"Invalid JSON: {e}")
            return

        if self.path == "/search":
            self._handle_search(body)
        elif self.path == "/run":
            self._handle_run(body)
        elif self.path == "/message":
            self._handle_message(body)
        elif self.path == "/shutdown":
            self._handle_shutdown(body)
        else:
            _respond_error(self, "Not found", 404)

    def _handle_search(self, body: dict):
        from primordial.cli.search import _fetch_results
        query = body.get("query")
        try:
            repos = _fetch_results(query)
        except Exception as e:
            _respond_error(self, str(e), 502)
            return
        results = [
            {
                "name": r["full_name"],
                "description": r.get("description") or "",
                "url": r["html_url"],
                "stars": r.get("stargazers_count", 0),
            }
            for r in repos
        ]
        _respond_json(self, results)

    def _handle_run(self, body: dict):
        url = body.get("url")
        ref = body.get("ref")
        if not url:
            _respond_error(self, "Missing 'url' field")
            return

        config = get_config()

        # Resolve agent
        if is_github_url(url):
            try:
                github_ref = parse_github_url(url, ref_override=ref)
                resolver = GitHubResolver()
                agent_dir = resolver.resolve(github_ref)
            except GitHubResolverError as e:
                _respond_error(self, f"GitHub resolve failed: {e}", 502)
                return
        else:
            agent_dir = Path(url)
            if not agent_dir.exists():
                installed = config.agents_dir / url
                if installed.exists():
                    agent_dir = installed
                else:
                    _respond_error(self, f"Agent not found: {url}", 404)
                    return

        try:
            manifest = load_manifest(agent_dir)
        except (FileNotFoundError, ValueError) as e:
            _respond_error(self, f"Invalid agent: {e}")
            return

        # Keys — check for missing required keys before spawning
        vault = KeyVault(config.keys_file)

        missing = []
        if not vault.get_key("e2b"):
            missing.append("e2b")
        if manifest.keys:
            for kr in manifest.keys:
                if kr.required and not vault.get_key(kr.provider):
                    missing.append(kr.provider)
        if missing:
            providers = ", ".join(missing)
            _respond_error(
                self,
                f"Missing API keys: {providers}. "
                f"Ask the user to run in a terminal: primordial setup {url}",
                428,
            )
            return

        if manifest.keys:
            allowed = [kr.provider for kr in manifest.keys]
        else:
            allowed = [manifest.runtime.default_model.provider]
        allowed.append("e2b")
        env_vars = vault.get_env_vars(providers=allowed)

        # Session
        session_id = uuid.uuid4().hex[:12]
        session_name = f"daemon-{session_id}"
        state_dir = config.session_state_dir(manifest.name, session_name)

        try:
            session = _manager.run_agent(
                agent_dir=agent_dir,
                manifest=manifest,
                workspace=Path(".").resolve(),
                env_vars=env_vars,
                state_dir=state_dir,
            )
        except Exception as e:
            _respond_error(self, f"Failed to start agent: {e}", 500)
            return

        if not session.wait_ready(timeout=120):
            session.shutdown()
            _respond_error(self, "Agent failed to start (no ready signal)", 500)
            return

        with _sessions_lock:
            _sessions[session_id] = _SessionEntry(session, manifest, agent_dir)

        _respond_json(self, {"session_id": session_id})

    def _handle_message(self, body: dict):
        session_id = body.get("session_id")
        content = body.get("content", "")
        message_id = body.get("message_id", f"auto_{uuid.uuid4().hex[:8]}")

        if not session_id:
            _respond_error(self, "Missing 'session_id'")
            return

        with _sessions_lock:
            entry = _sessions.get(session_id)
        if not entry:
            _respond_error(self, f"Unknown session: {session_id}", 404)
            return

        session = entry.session
        if not session.is_alive:
            _respond_error(self, "Agent process has exited", 410)
            return

        try:
            session.send_message(content, message_id)
        except Exception as e:
            _respond_error(self, f"Send failed: {e}", 500)
            return

        # Stream NDJSON response via chunked transfer
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()

        def _send_chunk(data: dict):
            line = json.dumps(data) + "\n"
            chunk = f"{len(line.encode()):x}\r\n{line}\r\n"
            self.wfile.write(chunk.encode())
            self.wfile.flush()

        while True:
            msg = session.receive(timeout=300)
            if msg is None:
                _send_chunk({"type": "error", "error": "timeout", "message_id": message_id})
                break
            _send_chunk(msg)
            if msg.get("type") == "response" and msg.get("done", False):
                break
            if msg.get("type") == "error":
                break

        # Send final empty chunk to signal end
        self.wfile.write(b"0\r\n\r\n")
        self.wfile.flush()

    def _handle_shutdown(self, body: dict):
        session_id = body.get("session_id")
        if not session_id:
            _respond_error(self, "Missing 'session_id'")
            return

        with _sessions_lock:
            entry = _sessions.pop(session_id, None)
        if not entry:
            _respond_error(self, f"Unknown session: {session_id}", 404)
            return

        entry.session.shutdown()
        _respond_json(self, {"ok": True})


@click.command()
@click.option("--port", default=DEFAULT_PORT, help="Port to listen on")
def serve(port: int):
    """Start the Primordial HTTP daemon for host agent integration."""
    global _daemon_token
    _daemon_token = _generate_daemon_token()
    console.print(f"[dim]Auth token written to {_TOKEN_FILE}[/dim]")

    server = HTTPServer(("127.0.0.1", port), DaemonHandler)
    console.print(f"[bold]Primordial daemon listening on http://127.0.0.1:{port}[/bold]")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        console.print("\n[dim]Shutting down...[/dim]")
        # Clean up all sessions
        with _sessions_lock:
            for entry in _sessions.values():
                try:
                    entry.session.shutdown()
                except Exception:
                    pass
            _sessions.clear()
        server.server_close()
