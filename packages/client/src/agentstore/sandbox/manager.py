"""E2B sandbox manager for running agents in isolated Firecracker microVMs."""

from __future__ import annotations

import io
import json
import logging
import os
import queue
import tarfile
import threading
from pathlib import Path
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

from e2b import Sandbox

from agentstore.models import AgentManifest

AGENT_HOME_IN_SANDBOX = "/home/user"
AGENT_DIR_IN_SANDBOX = "/home/user/agent"
WORKSPACE_DIR_IN_SANDBOX = "/home/user/workspace"
SKILL_FILE = Path(__file__).parent / "skill.md"
SKILL_DEST = "/home/user/skill.md"
_STATE_EXCLUDE_DIRS = [
    "agent", "venv", "workspace",
    ".cache", ".local", ".npm", ".docker",
]


class SandboxError(Exception):
    pass


class SandboxManager:
    """Manages E2B sandboxes for agent execution."""

    # Package registries that setup commands need — always allowed when
    # the agent declares a setup_command so pip/npm/etc. can fetch packages.
    _PACKAGE_REGISTRY_DOMAINS = [
        # Python
        "pypi.org",
        "files.pythonhosted.org",
        # Node
        "registry.npmjs.org",
        "registry.yarnpkg.com",
        "nodejs.org",
        # Git-based deps (npm/pip both support github refs)
        "github.com",
        "codeload.github.com",
    ]

    @staticmethod
    def _build_network_kwargs(manifest: AgentManifest) -> dict[str, Any]:
        """Build E2B network kwargs from manifest permissions.

        Three modes:
        - network_unrestricted: true → no filtering (full internet)
        - network: [domains...] → deny all except listed domains
        - No network config → deny all (fully isolated)

        Package registries (pypi.org, etc.) are auto-allowed when a
        setup_command is declared, so pip/npm installs work.
        """
        perms = manifest.permissions
        if perms.network_unrestricted:
            return {}

        allowed = [p.domain for p in perms.network]

        # Auto-allow package registries when there's a setup command
        if manifest.runtime.setup_command:
            for domain in SandboxManager._PACKAGE_REGISTRY_DOMAINS:
                if domain not in allowed:
                    allowed.append(domain)

        if allowed:
            return {"network": {"deny_out": ["0.0.0.0/0"], "allow_out": allowed}}
        return {"network": {"deny_out": ["0.0.0.0/0"]}}

    def _ensure_e2b_api_key(self, env_vars: dict[str, str]) -> None:
        """Ensure E2B_API_KEY is available, checking env_vars and os.environ."""
        if os.environ.get("E2B_API_KEY"):
            return
        if "E2B_API_KEY" in env_vars:
            os.environ["E2B_API_KEY"] = env_vars["E2B_API_KEY"]
            return
        raise SandboxError(
            "E2B API key not found. Add one with:\n"
            "  agentstore keys add e2b <your-key>\n"
            "  or: agentstore setup\n"
            "  or: export E2B_API_KEY=<your-key>\n"
            "Get your key at https://e2b.dev/dashboard"
        )

    def _upload_directory(self, sandbox: Sandbox, local_dir: Path, remote_dir: str) -> None:
        """Upload a local directory to the sandbox via tar."""
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tar:
            tar.add(str(local_dir), arcname=".")
        buf.seek(0)
        sandbox.files.write(f"/tmp/_upload.tar.gz", buf)
        sandbox.commands.run(f"mkdir -p {remote_dir} && tar xzf /tmp/_upload.tar.gz -C {remote_dir} && rm /tmp/_upload.tar.gz")

    def _upload_skill(self, sandbox: Sandbox) -> None:
        """Upload the built-in skill.md into the sandbox."""
        if not SKILL_FILE.exists():
            return
        sandbox.files.write(SKILL_DEST, SKILL_FILE.read_text())

    def _restore_state(self, sandbox: Sandbox, state_dir: Path) -> None:
        """Restore agent's home directory state from a previous run."""
        if not state_dir.exists() or not any(state_dir.iterdir()):
            return
        self._upload_directory(sandbox, state_dir, AGENT_HOME_IN_SANDBOX)

    def _save_state(self, sandbox: Sandbox, state_dir: Path) -> None:
        """Snapshot the agent's home directory back to host."""
        state_dir.mkdir(parents=True, exist_ok=True)
        exclude_args = " ".join(f"--exclude='./{d}'" for d in _STATE_EXCLUDE_DIRS)
        tmp_path = "/tmp/_state_snapshot.tar.gz"
        result = sandbox.commands.run(
            f"tar czf {tmp_path} {exclude_args} -C {AGENT_HOME_IN_SANDBOX} . 2>/dev/null; true"
        )
        try:
            tar_bytes = sandbox.files.read(tmp_path, format="bytes")
            with tarfile.open(fileobj=io.BytesIO(tar_bytes)) as tar_stream:
                tar_stream.extractall(path=str(state_dir), filter="data")
        except Exception as e:
            logger.warning("Failed to save session state: %s", e)

    def run_agent(
        self,
        agent_dir: Path,
        manifest: AgentManifest,
        workspace: Path,
        env_vars: dict[str, str],
        state_dir: Optional[Path] = None,
        on_status: Optional[Callable[[str], None]] = None,
    ) -> AgentSession:
        """Start an agent session in an E2B sandbox."""
        self._ensure_e2b_api_key(env_vars)

        def _status(msg: str) -> None:
            if on_status:
                on_status(msg)

        _status("Creating sandbox...")
        network_kwargs = self._build_network_kwargs(manifest)
        sandbox = Sandbox.create(
            template=manifest.runtime.e2b_template,
            envs=env_vars,
            **network_kwargs,
        )

        try:
            _status("Uploading agent code...")
            self._upload_directory(sandbox, agent_dir, AGENT_DIR_IN_SANDBOX)

            if workspace.is_dir():
                _status("Uploading workspace...")
                self._upload_directory(sandbox, workspace, WORKSPACE_DIR_IN_SANDBOX)
            else:
                sandbox.commands.run(f"mkdir -p {WORKSPACE_DIR_IN_SANDBOX}")

            self._upload_skill(sandbox)

            if state_dir:
                _status("Restoring state...")
                self._restore_state(sandbox, state_dir)

            if manifest.runtime.setup_command:
                _status("Running setup command...")
                result = sandbox.commands.run(
                    f"cd {AGENT_DIR_IN_SANDBOX} && {manifest.runtime.setup_command}",
                    timeout=600,
                )
                if result.exit_code != 0:
                    error_detail = (result.stderr or result.stdout or "")[:500]
                    raise SandboxError(f"Setup command failed: {error_detail}")

            _status("Starting agent...")
            messages: queue.Queue[dict[str, Any]] = queue.Queue()
            stderr_lines: list[str] = []

            cmd_handle = sandbox.commands.run(
                f"cd {AGENT_DIR_IN_SANDBOX} && {manifest.runtime.run_command}",
                background=True,
                stdin=True,
                timeout=0,  # No connection timeout — agent sessions are long-lived
            )

            def _on_stdout(data: str) -> None:
                for line in data.split("\n"):
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        msg = json.loads(line)
                        messages.put(msg)
                    except json.JSONDecodeError:
                        continue

            def _on_stderr(data: str) -> None:
                stderr_lines.append(data)

            return AgentSession(
                sandbox=sandbox,
                cmd_handle=cmd_handle,
                messages=messages,
                stderr_lines=stderr_lines,
                on_stdout=_on_stdout,
                on_stderr=_on_stderr,
                manager=self,
                state_dir=state_dir,
            )
        except Exception:
            try:
                sandbox.kill()
            except Exception:
                pass
            raise


class AgentSession:
    """Wraps a running agent process in an E2B sandbox with NDJSON communication."""

    def __init__(
        self,
        sandbox: Sandbox,
        cmd_handle: Any,
        messages: queue.Queue[dict[str, Any]],
        manager: SandboxManager,
        state_dir: Optional[Path] = None,
        stderr_lines: Optional[list[str]] = None,
        on_stdout: Optional[Any] = None,
        on_stderr: Optional[Any] = None,
    ):
        self._sandbox = sandbox
        self._cmd_handle = cmd_handle
        self._messages = messages
        self._manager = manager
        self._state_dir = state_dir
        self._stderr_lines = stderr_lines or []
        self._on_stdout = on_stdout
        self._on_stderr = on_stderr
        self._alive = True

        # Drive the event loop in a background thread — this is what
        # delivers stdout/stderr data from the E2B command handle.
        self._reader_thread = threading.Thread(target=self._drive_events, daemon=True)
        self._reader_thread.start()

    def _drive_events(self) -> None:
        try:
            self._cmd_handle.wait(
                on_stdout=self._on_stdout,
                on_stderr=self._on_stderr,
            )
        except Exception:
            pass
        finally:
            self._alive = False

    @property
    def is_alive(self) -> bool:
        return self._alive

    @property
    def stderr(self) -> str:
        return "".join(self._stderr_lines)

    def send_message(self, content: str, message_id: str) -> None:
        msg = json.dumps({
            "type": "message", "content": content, "message_id": message_id,
        })
        self._sandbox.commands.send_stdin(self._cmd_handle.pid, msg + "\n")

    def receive(self, timeout: float = 60.0) -> Optional[dict[str, Any]]:
        try:
            return self._messages.get(timeout=timeout)
        except queue.Empty:
            return None

    def wait_ready(self, timeout: float = 120.0) -> bool:
        """Wait for the agent to send a ready signal, skipping non-ready messages."""
        import time
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return False
            msg = self.receive(timeout=remaining)
            if msg is None:
                return False
            if msg.get("type") == "ready":
                return True
            # Non-ready messages (logs, early errors) — keep draining

    def shutdown(self) -> None:
        try:
            if self.is_alive:
                shutdown_msg = json.dumps({"type": "shutdown"})
                self._sandbox.commands.send_stdin(self._cmd_handle.pid, shutdown_msg + "\n")
                self._reader_thread.join(timeout=10)
        except Exception:
            pass
        finally:
            if self._state_dir:
                try:
                    self._manager._save_state(self._sandbox, self._state_dir)
                except Exception as e:
                    logger.warning("Failed to save state on shutdown: %s", e)
            try:
                self._sandbox.kill()
            except Exception:
                pass
