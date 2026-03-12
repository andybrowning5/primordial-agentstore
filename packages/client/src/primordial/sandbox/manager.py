"""E2B sandbox manager for running agents in isolated Firecracker microVMs."""

from __future__ import annotations

import io
import json
import logging
import os
import queue
import secrets
import subprocess
import tarfile
import tempfile
import threading
from pathlib import Path
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

from e2b import Sandbox

from primordial.models import AgentManifest, _PROTECTED_ENV_VARS

_PROXY_SCRIPT = Path(__file__).parent / "proxy_script.py"
_PROXY_PATH_IN_SANDBOX = "/opt/_primordial_proxy.py"
_DELEGATION_PROXY_SCRIPT = Path(__file__).parent / "delegation_proxy.py"
_DELEGATION_PROXY_PATH = "/opt/_primordial_delegation.py"

def _parse_max_time(value: str) -> int:
    """Parse a max_time string like '30m', '2h', '6h' into seconds."""
    value = value.strip().lower()
    if value.endswith("h"):
        return int(float(value[:-1]) * 3600)
    if value.endswith("m"):
        return int(float(value[:-1]) * 60)
    if value.endswith("s"):
        return int(float(value[:-1]))
    return int(value)  # assume seconds


AGENT_HOME_IN_SANDBOX = "/home/user"
AGENT_DIR_IN_SANDBOX = "/home/user/agent"
WORKSPACE_DIR_IN_SANDBOX = "/home/user/workspace"
# SECURITY: Allowlist for state persistence. Only these subdirectories
# of the agent home are saved/restored between sessions. Everything else
# (dotfiles, .config, .local, .ssh, etc.) is excluded by default.
_STATE_ALLOW_DIRS = [
    "workspace",
    "data",
    "output",
    "state",
]


def _shell_escape(s: str) -> str:
    """Escape a string for safe use in shell assignments."""
    return "'" + s.replace("'", "'\\''") + "'"


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

        # Auto-allow API domains declared in key requirements.
        for key_req in manifest.keys:
            if key_req.domain and key_req.domain not in allowed:
                allowed.append(key_req.domain)

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
            "  primordial keys add e2b <your-key>\n"
            "  or: primordial setup\n"
            "  or: export E2B_API_KEY=<your-key>\n"
            "Get your key at https://e2b.dev/dashboard"
        )

    def _upload_directory(self, sandbox: Sandbox, local_dir: Path, remote_dir: str) -> None:
        """Upload a local directory to the sandbox via tar."""
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tar:
            tar.add(str(local_dir), arcname=".")
        buf.seek(0)
        tmp_name = f"/tmp/_upload_{secrets.token_hex(8)}.tar.gz"
        sandbox.files.write(tmp_name, buf)
        sandbox.commands.run(f"mkdir -p {remote_dir} && tar xzf {tmp_name} -C {remote_dir} && rm {tmp_name}")

    def _restore_state(self, sandbox: Sandbox, state_dir: Path) -> None:
        """Restore agent's home directory state from a previous run."""
        if not state_dir.exists() or not any(state_dir.iterdir()):
            return
        self._upload_directory(sandbox, state_dir, AGENT_HOME_IN_SANDBOX)

    def _save_state(self, sandbox: Sandbox, state_dir: Path) -> None:
        """Snapshot allowed subdirectories of agent home back to host."""
        state_dir.mkdir(parents=True, exist_ok=True)
        # SECURITY: Only persist explicitly allowed directories (allowlist).
        # This prevents dotfile poisoning, config injection, and planted
        # binaries from surviving across sessions.
        dirs_to_save = " ".join(
            f"./{d}" for d in _STATE_ALLOW_DIRS
        )
        tmp_path = f"/tmp/_state_{secrets.token_hex(8)}.tar.gz"
        result = sandbox.commands.run(
            f"cd {AGENT_HOME_IN_SANDBOX} && tar czf {tmp_path} {dirs_to_save} 2>/dev/null; true"
        )
        try:
            tar_bytes = sandbox.files.read(tmp_path, format="bytes")
            with tarfile.open(fileobj=io.BytesIO(tar_bytes)) as tar_stream:
                # SECURITY: Only extract regular files and directories.
                # Rejects absolute paths, ".." traversal, symlinks, device
                # files, FIFOs, and sockets to prevent tar-based attacks.
                safe_members = []
                for member in tar_stream.getmembers():
                    if member.name.startswith("/") or ".." in member.name.split("/"):
                        continue
                    if not (member.isfile() or member.isdir()):
                        continue
                    safe_members.append(member)
                tar_stream.extractall(path=str(state_dir), members=safe_members)
        except Exception as e:
            logger.warning("Failed to save session state: %s", e)

    def _apply_hardening(self, sandbox: Sandbox, needs_proxy: bool = False) -> None:
        """Apply security hardening to the sandbox before any user code runs.

        This MUST be called before setup_command or proxy start to prevent
        privilege escalation and /proc snooping.

        If needs_proxy is True and hidepid=2 fails, raises SandboxError
        to fail closed rather than running the proxy with /proc exposed.
        """
        sandbox.commands.run(
            "chmod o-rx /usr/bin/sudo /usr/bin/su /usr/sbin/su 2>/dev/null; "
            "deluser user sudo 2>/dev/null; true",
            user="root",
        )
        result = sandbox.commands.run(
            "mount -o remount,hidepid=2 /proc",
            user="root",
        )
        if result.exit_code != 0:
            if needs_proxy:
                raise SandboxError(
                    "Cannot mount /proc with hidepid=2. API key proxy requires "
                    "/proc isolation to prevent key leakage. Aborting."
                )
            logger.warning("hidepid=2 mount failed — no proxy needed, continuing")

    def _start_proxy(
        self,
        sandbox: Sandbox,
        manifest: AgentManifest,
        env_vars: dict[str, str],
    ) -> tuple[Optional[int], dict[str, str]]:
        """Start the in-sandbox reverse proxy for API key isolation.

        Returns (proxy_pid, agent_envs) where agent_envs contains
        placeholder keys and localhost base URLs for the agent process.
        Hardening must already be applied via _apply_hardening().
        """
        if not manifest.keys or not _PROXY_SCRIPT.exists():
            return None, {}

        session_token = f"sk-ant-proxy01-{secrets.token_hex(24)}"
        routes: list[dict[str, Any]] = []
        agent_envs: dict[str, str] = {}
        port = 9001

        for key_req in manifest.keys:
            env_name = key_req.resolved_env_var()
            real_key = env_vars.get(env_name)
            if not real_key:
                continue

            domain = key_req.domain
            auth_style = key_req.auth_style
            base_url_env = key_req.base_url_env or f"{key_req.provider.upper().replace('-', '_')}_BASE_URL"

            if base_url_env in _PROTECTED_ENV_VARS:
                raise SandboxError(
                    f"base_url_env {base_url_env!r} conflicts with "
                    f"a protected environment variable"
                )

            # SECURITY: Detect env name collisions to prevent route hijacking
            if base_url_env in agent_envs:
                raise SandboxError(
                    f"Duplicate base_url_env {base_url_env!r} in manifest keys — "
                    f"this would hijack an existing proxy route"
                )
            if env_name in agent_envs:
                raise SandboxError(
                    f"Duplicate env_var {env_name!r} in manifest keys — "
                    f"this would hijack an existing proxy route"
                )

            routes.append({
                "port": port,
                "target_host": domain,
                "real_key": real_key,
                "auth_style": auth_style,
            })
            agent_envs[env_name] = session_token
            agent_envs[base_url_env] = f"http://127.0.0.1:{port}"
            port += 1

        if not routes:
            return None, {}

        # Upload proxy script (hardening already applied by _apply_hardening)
        sandbox.files.write(_PROXY_PATH_IN_SANDBOX, _PROXY_SCRIPT.read_text(), user="root")
        sandbox.commands.run(f"chmod 700 {_PROXY_PATH_IN_SANDBOX}", user="root")

        # Start the proxy — /proc is already hidden
        proxy_handle = sandbox.commands.run(
            f"python3 {_PROXY_PATH_IN_SANDBOX}",
            background=True, stdin=True, user="root", timeout=0,
        )
        proxy_pid = proxy_handle.pid

        # Include session_token in config so proxy can validate requests
        proxy_config = {
            "routes": routes,
            "session_token": session_token,
        }
        sandbox.commands.send_stdin(proxy_pid, json.dumps(proxy_config) + "\n")

        # Wait for proxy to emit ready signal on stdout
        proxy_ready = threading.Event()

        def _watch_proxy_stdout(data: str) -> None:
            for line in data.split("\n"):
                line = line.strip()
                if not line:
                    continue
                try:
                    msg = json.loads(line)
                    if msg.get("status") == "ready":
                        proxy_ready.set()
                except json.JSONDecodeError:
                    continue

        # Start reading stdout in background thread
        def _read_proxy():
            try:
                proxy_handle.wait(on_stdout=_watch_proxy_stdout)
            except Exception:
                pass  # Sandbox killed — expected on shutdown

        reader = threading.Thread(target=_read_proxy, daemon=True)
        reader.start()

        if not proxy_ready.wait(timeout=10):
            logger.warning("Security proxy did not signal ready in time")

        return proxy_pid, agent_envs

    def _snapshot_workspace(self, host_workspace: Path) -> bytes | None:
        """Create a tar.gz snapshot of the host working tree.

        Captures all tracked files (at their current on-disk state, including
        uncommitted changes) plus untracked non-ignored files.  Respects
        .gitignore.  Does not modify the host repo in any way.
        """
        cwd = str(host_workspace)
        try:
            # Get all files git tracks + untracked non-ignored files
            result = subprocess.run(
                ["git", "ls-files", "--cached", "--others",
                 "--exclude-standard", "-z"],
                cwd=cwd, capture_output=True, timeout=30,
            )
            if result.returncode != 0:
                logger.warning("git ls-files failed: %s",
                               result.stderr.decode(errors="replace"))
                return None

            files = [f for f in result.stdout.decode().split("\0") if f]
            if not files:
                return None

            buf = io.BytesIO()
            with tarfile.open(fileobj=buf, mode="w:gz") as tar:
                for f in files:
                    full = host_workspace / f
                    if full.is_file():
                        tar.add(str(full), arcname=f)
            return buf.getvalue()
        except Exception as e:
            logger.warning("Failed to snapshot workspace: %s", e)
            return None

    def _upload_workspace_snapshot(
        self,
        sandbox: Sandbox,
        snapshot_bytes: bytes,
        readonly: bool,
    ) -> None:
        """Upload workspace snapshot to sandbox and init a git baseline."""
        tmp = f"/tmp/_workspace_{secrets.token_hex(8)}.tar.gz"
        sandbox.files.write(tmp, snapshot_bytes)

        result = sandbox.commands.run(
            f"rm -rf {WORKSPACE_DIR_IN_SANDBOX} && "
            f"mkdir -p {WORKSPACE_DIR_IN_SANDBOX} && "
            f"cd {WORKSPACE_DIR_IN_SANDBOX} && "
            f"tar xzf {tmp} && rm -f {tmp} && "
            # Generate a file tree map so LLM-based agents can navigate selectively
            f"find . -not -path './.git/*' -type f "
            f"-exec ls -lh {{}} \\; 2>/dev/null | "
            f"awk '{{printf \"%s\\t%s\\n\", $5, $NF}}' | sort -k2 "
            f"> WORKSPACE_MAP && "
            f"git init -q && git add -A && "
            f"git -c user.name=primordial -c user.email=noreply "
            f"commit -q -m snapshot --allow-empty",
            user="user",
        )
        if result.exit_code != 0:
            logger.warning("workspace snapshot extract failed: %s", result.stderr)
            return

        if readonly:
            sandbox.commands.run(
                f"chmod -R a-w {WORKSPACE_DIR_IN_SANDBOX}",
                user="root",
            )

    def _extract_workspace_patch(self, sandbox: Sandbox) -> bytes | None:
        """Run git diff in sandbox workspace, return patch bytes or None.

        Compares current state against the initial 'snapshot' commit so we
        capture all changes even if the agent made its own git commits.
        """
        # Stage any uncommitted changes so they're included in the diff
        sandbox.commands.run(
            f"cd {WORKSPACE_DIR_IN_SANDBOX} && git add -A && "
            f"git -c user.name=primordial -c user.email=noreply "
            f"diff-index --quiet HEAD || "
            f"git -c user.name=primordial -c user.email=noreply "
            f"commit -q -m 'primordial: uncommitted changes' --allow-empty",
            user="user",
        )
        # Diff HEAD against the first commit (the snapshot baseline)
        result = sandbox.commands.run(
            f"cd {WORKSPACE_DIR_IN_SANDBOX} && "
            f"git diff $(git rev-list --max-parents=0 HEAD)..HEAD",
            user="user",
        )
        if result.exit_code != 0 or not result.stdout:
            return None
        patch = result.stdout.encode() if isinstance(result.stdout, str) else result.stdout
        return patch if patch.strip() else None

    def _build_run_command(
        self,
        sandbox: Sandbox,
        manifest: AgentManifest,
        agent_envs: dict[str, str],
    ) -> str:
        """Build the command to start the agent, injecting proxy env vars."""
        # Always set WORKSPACE so agents know where the host code lives
        base_envs = {
            "WORKSPACE": WORKSPACE_DIR_IN_SANDBOX,
        }
        all_envs = {**base_envs, **agent_envs}

        env_prefix = " ".join(
            f"{k}={_shell_escape(v)}" for k, v in all_envs.items()
        )
        return f"cd {AGENT_DIR_IN_SANDBOX} && {env_prefix} exec {manifest.runtime.run_command}"

    def _start_delegation_proxy(
        self,
        sandbox: Sandbox,
        manifest: AgentManifest,
        env_vars: dict[str, str],
        worktree_mgr: Optional[Any] = None,
        delegation_depth: int = 0,
    ) -> Optional["DelegationHandler"]:
        """Start the delegation proxy if delegation is enabled.

        Uploads the delegation proxy (root-owned), starts the proxy process,
        and launches the host-side delegation loop.
        """
        if not manifest.permissions.delegation.enabled:
            return None
        if not _DELEGATION_PROXY_SCRIPT.exists():
            logger.warning("Delegation proxy script not found, skipping")
            return None

        # Upload proxy (root-owned, agent can't read)
        sandbox.files.write(
            _DELEGATION_PROXY_PATH,
            _DELEGATION_PROXY_SCRIPT.read_text(),
            user="root",
        )
        sandbox.commands.run(f"chmod 700 {_DELEGATION_PROXY_PATH}", user="root")

        # Start delegation proxy as root
        deleg_handle = sandbox.commands.run(
            f"python3 {_DELEGATION_PROXY_PATH}",
            background=True,
            stdin=True,
            user="root",
            timeout=0,
        )

        # Create and start the host-side handler
        handler = DelegationHandler(
            sandbox=sandbox,
            deleg_handle=deleg_handle,
            manifest=manifest,
            env_vars=env_vars,
            manager=self,
            worktree_mgr=worktree_mgr,
            delegation_depth=delegation_depth,
        )
        handler.start()

        # Wait for delegation proxy to signal ready
        if not handler.wait_ready(timeout=10):
            logger.warning("Delegation proxy did not signal ready in time")

        return handler

    def run_agent(
        self,
        agent_dir: Path,
        manifest: AgentManifest,
        workspace: Optional[Path],
        env_vars: dict[str, str],
        state_dir: Optional[Path] = None,
        on_status: Optional[Callable[[str], None]] = None,
        worktree_mgr: Optional[Any] = None,
        delegation_depth: int = 0,
    ) -> AgentSession:
        """Start an agent session in an E2B sandbox."""
        self._ensure_e2b_api_key(env_vars)

        def _status(msg: str) -> None:
            if on_status:
                on_status(msg)

        _status("Creating sandbox...")
        network_kwargs = self._build_network_kwargs(manifest)

        # SECURITY: Only pass known-safe env vars into the sandbox.
        # Allowlist approach prevents credential leakage via non-standard
        # env var names (AWS_ACCESS_KEY_ID, DATABASE_URL, etc.).
        _SAFE_ENV_ALLOWLIST = {
            "PATH", "HOME", "USER", "SHELL", "LANG", "LC_ALL",
            "LC_CTYPE", "TERM", "TZ", "PYTHONPATH", "NODE_PATH",
        }
        safe_envs = {
            k: v for k, v in env_vars.items()
            if k in _SAFE_ENV_ALLOWLIST
        }
        timeout = _parse_max_time(manifest.runtime.resources.max_time)
        sandbox = Sandbox.create(
            template="base",
            envs=safe_envs,
            timeout=timeout,
            **network_kwargs,
        )

        try:
            _status("Uploading agent code...")
            self._upload_directory(sandbox, agent_dir, AGENT_DIR_IN_SANDBOX)

            sandbox.commands.run(f"mkdir -p {WORKSPACE_DIR_IN_SANDBOX}")

            # Detect if this is a resumed session (state_dir has content)
            _is_resumed = (
                state_dir is not None
                and state_dir.exists()
                and any(state_dir.iterdir())
            )

            if state_dir:
                _status("Restoring state...")
                self._restore_state(sandbox, state_dir)

            # Upload host workspace snapshot — only for NEW sessions.
            # Resumed sessions keep their workspace from the previous run
            # so iterative agents don't lose progress.
            fs_perm = manifest.permissions.filesystem.workspace
            _workspace_bundle_uploaded = False
            if workspace and fs_perm in ("readonly", "readwrite") and not _is_resumed:
                _status("Snapshotting workspace...")
                snapshot = self._snapshot_workspace(workspace)
                if snapshot:
                    _status("Uploading workspace...")
                    self._upload_workspace_snapshot(
                        sandbox, snapshot, readonly=(fs_perm == "readonly"),
                    )
                    _workspace_bundle_uploaded = True

            # SECURITY: Apply hardening BEFORE setup_command runs.
            # This prevents malicious setup commands from reading /proc,
            # escalating privileges, or planting background watchers.
            _status("Hardening sandbox...")
            self._apply_hardening(sandbox, needs_proxy=bool(manifest.keys))

            # --- Start proxies in parallel ---
            # SECURITY: Both proxies start BEFORE setup_command to prevent
            # malicious setup from pre-binding proxy ports.
            proxy_pid, agent_envs = None, {}
            delegation_handler = None

            needs_security = bool(manifest.keys)
            needs_delegation = manifest.permissions.delegation.enabled

            if needs_security and needs_delegation:
                _status("Starting proxies...")
                proxy_result: list[tuple] = [()]
                deleg_result: list[Optional["DelegationHandler"]] = [None]
                errors: list[Exception] = []

                def _start_sec():
                    try:
                        proxy_result[0] = self._start_proxy(sandbox, manifest, env_vars)
                    except Exception as e:
                        errors.append(e)

                def _start_del():
                    try:
                        deleg_result[0] = self._start_delegation_proxy(
                            sandbox, manifest, env_vars, worktree_mgr,
                            delegation_depth=delegation_depth,
                        )
                    except Exception as e:
                        errors.append(e)

                t1 = threading.Thread(target=_start_sec)
                t2 = threading.Thread(target=_start_del)
                t1.start()
                t2.start()
                t1.join()
                t2.join()
                if errors:
                    raise errors[0]
                proxy_pid, agent_envs = proxy_result[0]
                delegation_handler = deleg_result[0]
            elif needs_security:
                _status("Starting security proxy...")
                proxy_pid, agent_envs = self._start_proxy(sandbox, manifest, env_vars)
            elif needs_delegation:
                _status("Starting delegation proxy...")
                delegation_handler = self._start_delegation_proxy(
                    sandbox, manifest, env_vars, worktree_mgr,
                    delegation_depth=delegation_depth,
                )

            if manifest.runtime.setup_command:
                _status("Running setup command...")
                result = sandbox.commands.run(
                    f"cd {AGENT_DIR_IN_SANDBOX} && {manifest.runtime.setup_command}",
                    timeout=6000,
                    user="user",
                )
                if result.exit_code != 0:
                    error_detail = (result.stderr or result.stdout or "")[:500]
                    raise SandboxError(f"Setup command failed: {error_detail}")

            _status("Starting agent...")
            messages: queue.Queue[dict[str, Any]] = queue.Queue()
            stderr_lines: list[str] = []

            run_cmd = self._build_run_command(sandbox, manifest, agent_envs)
            cmd_handle = sandbox.commands.run(
                run_cmd,
                background=True,
                stdin=True,
                timeout=0,  # No connection timeout — agent sessions are long-lived
                user="user",
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
                proxy_pid=proxy_pid,
                delegation_handler=delegation_handler,
                workspace_uploaded=_workspace_bundle_uploaded,
                workspace_readonly=(fs_perm == "readonly"),
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
        proxy_pid: Optional[int] = None,
        delegation_handler: Optional["DelegationHandler"] = None,
        workspace_uploaded: bool = False,
        workspace_readonly: bool = False,
    ):
        self._sandbox = sandbox
        self._cmd_handle = cmd_handle
        self._messages = messages
        self._manager = manager
        self._state_dir = state_dir
        self._stderr_lines = stderr_lines or []
        self._on_stdout = on_stdout
        self._on_stderr = on_stderr
        self._proxy_pid = proxy_pid
        self._delegation_handler = delegation_handler
        self._workspace_uploaded = workspace_uploaded
        self._workspace_readonly = workspace_readonly
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

    def receive(self, timeout: float = 600.0) -> Optional[dict[str, Any]]:
        try:
            return self._messages.get(timeout=timeout)
        except queue.Empty:
            return None

    def wait_ready(self, timeout: float = 1200.0) -> bool:
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

    def shutdown(self) -> bytes | None:
        """Shutdown the agent, extract workspace patch if applicable."""
        patch: bytes | None = None
        try:
            # Shutdown delegation handler first (saves sub-agent state)
            if self._delegation_handler:
                try:
                    self._delegation_handler.shutdown()
                except Exception as e:
                    logger.warning("Failed to shutdown delegation handler: %s", e)

            if self.is_alive:
                shutdown_msg = json.dumps({"type": "shutdown"})
                self._sandbox.commands.send_stdin(self._cmd_handle.pid, shutdown_msg + "\n")
                self._reader_thread.join(timeout=3)

            # Extract workspace patch before saving state / killing sandbox
            if self._workspace_uploaded and not self._workspace_readonly:
                try:
                    patch = self._manager._extract_workspace_patch(self._sandbox)
                except Exception as e:
                    logger.warning("Failed to extract workspace patch: %s", e)
        except Exception:
            pass
        finally:
            if self._state_dir:
                try:
                    # Save delegation session mapping for resume
                    if self._delegation_handler:
                        self._delegation_handler.save_session_mapping(self._state_dir)
                    self._manager._save_state(self._sandbox, self._state_dir)
                except Exception as e:
                    logger.warning("Failed to save state on shutdown: %s", e)
            if self._proxy_pid:
                try:
                    self._sandbox.commands.run(f"kill {self._proxy_pid}", user="root")
                except Exception:
                    pass
            try:
                self._sandbox.kill()
            except Exception:
                pass
        return patch




class DelegationHandler:
    """Host-side handler for agent delegation requests.

    Reads NDJSON commands from the delegation proxy's stdout, processes them
    (search, run, message, monitor, stop), and writes responses back via stdin.
    Each sub-agent runs in its own fresh E2B sandbox.
    """

    _MAX_OUTPUT_LINES = 1000

    _MAX_DELEGATION_DEPTH = 3

    def __init__(
        self,
        sandbox: Sandbox,
        deleg_handle: Any,
        manifest: AgentManifest,
        env_vars: dict[str, str],
        manager: SandboxManager,
        worktree_mgr: Optional[Any] = None,
        delegation_depth: int = 0,
    ):
        self._sandbox = sandbox
        self._deleg_handle = deleg_handle
        self._manifest = manifest
        self._env_vars = env_vars
        self._manager = manager
        self._worktree_mgr = worktree_mgr
        self._delegation_depth = delegation_depth
        self._sessions: dict[str, AgentSession] = {}
        self._output_buffers: dict[str, list[str]] = {}
        self._session_meta: dict[str, dict] = {}  # session_id -> {agent_url, session_name}
        self._messages: queue.Queue[dict[str, Any]] = queue.Queue()
        self._ready = threading.Event()
        self._stop = threading.Event()
        self._session_counter = 0
        self._lock = threading.Lock()

        # Callbacks for pausing/resuming host UI (e.g. spinners) during input
        self.on_input_needed: Optional[Callable[[], None]] = None
        self.on_input_done: Optional[Callable[[], None]] = None

        # Serialize key prompts so only one thread prompts at a time
        self._input_lock = threading.Lock()
        # True while a key prompt is visible — lets the TUI know to stay paused
        self.input_active = False

    def start(self) -> None:
        """Start the delegation handler threads."""
        self._reader_thread = threading.Thread(
            target=self._read_proxy_stdout, daemon=True,
        )
        self._handler_thread = threading.Thread(
            target=self._handle_commands, daemon=True,
        )
        self._reader_thread.start()
        self._handler_thread.start()

    def wait_ready(self, timeout: float = 10.0) -> bool:
        """Wait for the delegation proxy to signal ready."""
        return self._ready.wait(timeout=timeout)

    def _read_proxy_stdout(self) -> None:
        """Read NDJSON from delegation proxy stdout and queue messages."""
        def _on_stdout(data: str) -> None:
            for line in data.split("\n"):
                line = line.strip()
                if not line:
                    continue
                try:
                    msg = json.loads(line)
                    if msg.get("type") == "delegation_ready":
                        self._ready.set()
                    else:
                        self._messages.put(msg)
                except json.JSONDecodeError:
                    continue

        def _on_stderr(data: str) -> None:
            logger.debug("Delegation proxy stderr: %s", data.strip())

        try:
            self._deleg_handle.wait(on_stdout=_on_stdout, on_stderr=_on_stderr)
        except Exception:
            pass

    def _send_to_proxy(self, msg: dict) -> None:
        """Write NDJSON response to the delegation proxy's stdin (thread-safe)."""
        line = json.dumps(msg) + "\n"
        with self._lock:
            self._sandbox.commands.send_stdin(
                self._deleg_handle.pid,
                line,
            )

    def _handle_commands(self) -> None:
        """Process delegation commands from the queue."""
        while not self._stop.is_set():
            try:
                msg = self._messages.get(timeout=1.0)
            except queue.Empty:
                continue

            cmd = msg.get("type", "")
            req_id = msg.get("request_id", "")

            try:
                if cmd == "search":
                    self._handle_search(msg, req_id)
                elif cmd == "search_all":
                    self._handle_search_all(req_id)
                elif cmd == "run":
                    # Resolve manifest and ensure API keys are available
                    # BEFORE spawning the thread.  This way all key prompts
                    # happen sequentially on the command thread and the user
                    # sees them before any sandbox setup begins.
                    prepared = self._prepare_run(msg, req_id)
                    if prepared is not None:
                        threading.Thread(
                            target=self._execute_run,
                            args=(prepared, req_id),
                            daemon=True,
                        ).start()
                elif cmd == "message":
                    threading.Thread(
                        target=self._handle_message,
                        args=(msg, req_id),
                        daemon=True,
                    ).start()
                elif cmd == "monitor":
                    self._handle_monitor(msg, req_id)
                elif cmd == "stop":
                    threading.Thread(
                        target=self._handle_stop,
                        args=(msg, req_id),
                        daemon=True,
                    ).start()
                else:
                    self._send_to_proxy({
                        "type": "error",
                        "error": f"Unknown command: {cmd}",
                        "request_id": req_id,
                    })
            except Exception as e:
                logger.exception("Error handling delegation command %s", cmd)
                try:
                    self._send_to_proxy({
                        "type": "error",
                        "error": str(e),
                        "request_id": req_id,
                    })
                except Exception:
                    logger.warning("Cannot send error to proxy (sandbox may have timed out)")
                    return

    def _handle_search(self, msg: dict, req_id: str) -> None:
        """Semantic search for agents."""
        from primordial.discovery import fetch_agents, enrich_from_cache
        from primordial.ranking import semantic_rank

        query = msg.get("query", "")
        agents = fetch_agents()
        agents = enrich_from_cache(agents)
        ranked = semantic_rank(query, agents, top_k=5)
        self._send_to_proxy({
            "type": "search_result",
            "agents": ranked,
            "request_id": req_id,
        })

    def _handle_search_all(self, req_id: str) -> None:
        """List all agents sorted by stars."""
        from primordial.discovery import fetch_agents, MAX_RESULTS

        agents = fetch_agents()
        self._send_to_proxy({
            "type": "search_result",
            "agents": agents[:MAX_RESULTS],
            "request_id": req_id,
        })

    def _prepare_run(self, msg: dict, req_id: str) -> Optional[dict]:
        """Resolve manifest, check API keys, and prompt if needed.

        Runs on the command thread (serial) so all key prompts happen
        before any sandbox starts spinning up.  Returns a prepared dict
        with everything needed for _execute_run, or None on failure.
        """
        agent_url = msg.get("agent_url", "")
        if not agent_url:
            self._send_to_proxy({
                "type": "error",
                "error": "agent_url is required",
                "request_id": req_id,
            })
            return None

        # Limit delegation depth to prevent infinite recursion
        if self._delegation_depth >= self._MAX_DELEGATION_DEPTH:
            self._send_to_proxy({
                "type": "error",
                "error": f"Maximum delegation depth of {self._MAX_DELEGATION_DEPTH} reached. Cannot spawn further sub-agents.",
                "request_id": req_id,
            })
            return None

        # Limit concurrent sub-agents
        MAX_SUB_AGENTS = 6
        with self._lock:
            active = sum(1 for s in self._sessions.values() if s.sandbox is not None)
        if active >= MAX_SUB_AGENTS:
            self._send_to_proxy({
                "type": "error",
                "error": f"Maximum of {MAX_SUB_AGENTS} concurrent sub-agents reached. Stop an existing agent first.",
                "request_id": req_id,
            })
            return None

        # Validate against allowed_agents if set
        allowed = self._manifest.permissions.delegation.allowed_agents
        if allowed:
            # Exact match against owner/repo or full URL — no substring matching
            matched = any(
                agent_url == a or agent_url.rstrip("/").endswith(f"/{a}")
                for a in allowed
            )
            if not matched:
                self._send_to_proxy({
                    "type": "error",
                    "error": f"Agent not in allowed_agents list: {agent_url}",
                    "request_id": req_id,
                })
                return None

        try:
            # Resolve the agent (GitHub URL or local path)
            from primordial.github import GitHubResolver, is_github_url, parse_github_url
            from primordial.manifest import load_manifest

            if is_github_url(agent_url):
                github_ref = parse_github_url(agent_url)
                resolver = GitHubResolver(quiet=True)
                agent_dir = resolver.resolve(github_ref, force_refresh=False)
            else:
                agent_dir = Path(agent_url)
            sub_manifest = load_manifest(agent_dir)

            # Generate session ID (or reuse a preferred one if not taken)
            preferred_sid = msg.get("session_id")
            with self._lock:
                if preferred_sid and preferred_sid not in self._sessions:
                    session_id = preferred_sid
                else:
                    self._session_counter += 1
                    session_id = f"deleg-{self._session_counter}"
            # Allow resuming a previous session by passing its session_name
            session_name = msg.get("session") or f"sub-{secrets.token_hex(4)}"

            # Determine state dir for sub-agent
            from primordial.config import get_config
            config = get_config()
            sub_state_dir = config.session_state_dir(sub_manifest.name, session_name)

            # Check for missing required keys and prompt the user.
            from primordial.security.key_vault import KeyVault
            import click
            vault = KeyVault(config.keys_file)
            sub_providers = [kr.provider for kr in sub_manifest.keys] if sub_manifest.keys else []
            sub_providers.append("e2b")  # Always needed for sandbox creation

            if sub_manifest.keys:
                missing = [kr for kr in sub_manifest.keys if kr.required and not vault.get_key(kr.provider)]
                if missing:
                    from rich.console import Console
                    console = Console()
                    self.input_active = True
                    if self.on_input_needed:
                        self.on_input_needed()
                    display = sub_manifest.display_name or sub_manifest.name
                    console.print(f"\n[bold yellow]Sub-agent [cyan]{display}[/cyan] needs API keys to continue:[/bold yellow]")
                    for kr in missing:
                        console.print(f"  [red]✗[/red] {kr.provider} [dim]({kr.resolved_env_var()})[/dim]")
                    console.print()
                    for kr in missing:
                        key = click.prompt(
                            f"  Paste {kr.provider.upper()} API key ({kr.resolved_env_var()})",
                            hide_input=True,
                        )
                        if key.strip():
                            vault.add_key(kr.provider, key.strip())
                            console.print(f"  [dim]Stored {kr.provider}.[/dim]")
                        else:
                            self.input_active = False
                            if self.on_input_done:
                                self.on_input_done()
                            self._send_to_proxy({
                                "type": "error",
                                "error": f"Missing required API key: {kr.provider}",
                                "request_id": req_id,
                            })
                            return None
                    console.print()
                    self.input_active = False
                    if self.on_input_done:
                        self.on_input_done()

            sub_env_vars = vault.get_env_vars(providers=sub_providers)

            return {
                "agent_url": agent_url,
                "agent_dir": agent_dir,
                "sub_manifest": sub_manifest,
                "session_id": session_id,
                "session_name": session_name,
                "sub_state_dir": sub_state_dir,
                "sub_env_vars": sub_env_vars,
            }

        except Exception as e:
            import traceback as _tb
            logger.error(f"Sub-agent prepare failed: {_tb.format_exc()}")
            self._send_to_proxy({
                "type": "error",
                "error": f"Failed to prepare agent: {e}",
                "request_id": req_id,
            })
            return None

    def _execute_run(self, prepared: dict, req_id: str) -> None:
        """Create the sandbox and start the sub-agent.

        Runs in its own thread so multiple agents can spawn concurrently.
        All key prompting has already been handled by _prepare_run.
        """
        agent_url = prepared["agent_url"]
        agent_dir = prepared["agent_dir"]
        sub_manifest = prepared["sub_manifest"]
        session_id = prepared["session_id"]
        session_name = prepared["session_name"]
        sub_state_dir = prepared["sub_state_dir"]
        sub_env_vars = prepared["sub_env_vars"]

        try:
            # Send agent info before setup begins
            display = sub_manifest.display_name or sub_manifest.name
            version = sub_manifest.version or ""
            self._send_to_proxy({
                "type": "setup_status",
                "session_id": session_id,
                "agent_name": display,
                "agent_version": version,
                "status": f"Spawning {display} v{version}" if version else f"Spawning {display}",
                "request_id": req_id,
            })

            # Create sub-agent sandbox with status forwarding
            def _on_status(status: str) -> None:
                self._send_to_proxy({
                    "type": "setup_status",
                    "session_id": session_id,
                    "status": status,
                    "request_id": req_id,
                })

            # Create a worktree for the sub-agent if worktree isolation is active
            sub_workspace: Optional[Path] = None
            if self._worktree_mgr:
                sub_fs_perm = sub_manifest.permissions.filesystem.workspace
                if sub_fs_perm in ("readonly", "readwrite"):
                    try:
                        sub_workspace = self._worktree_mgr.create(sub_manifest.name)
                        _on_status(f"Worktree: {sub_workspace}")
                    except Exception as e:
                        logger.warning("Failed to create worktree for sub-agent %s: %s",
                                       sub_manifest.name, e)

            sub_session = self._manager.run_agent(
                agent_dir=agent_dir,
                manifest=sub_manifest,
                workspace=sub_workspace,
                env_vars=sub_env_vars,
                state_dir=sub_state_dir,
                on_status=_on_status,
                delegation_depth=self._delegation_depth + 1,
            )

            if not sub_session.wait_ready(timeout=1200):
                sub_session.shutdown()
                self._send_to_proxy({
                    "type": "error",
                    "error": "Sub-agent failed to start",
                    "request_id": req_id,
                })
                return

            # Store agent name for worktree lookup on shutdown
            sub_session._agent_name = sub_manifest.name

            with self._lock:
                self._sessions[session_id] = sub_session
                self._output_buffers[session_id] = []
                self._session_meta[session_id] = {
                    "agent_url": agent_url,
                    "session_name": session_name,
                }

            self._send_to_proxy({
                "type": "session",
                "session_id": session_id,
                "session_name": session_name,
                "request_id": req_id,
            })

        except Exception as e:
            import traceback as _tb
            logger.error(f"Sub-agent spawn failed: {_tb.format_exc()}")
            self._send_to_proxy({
                "type": "error",
                "error": f"Failed to start agent: {e}",
                "request_id": req_id,
            })

    def _handle_message(self, msg: dict, req_id: str) -> None:
        """Send a message to a sub-agent and stream events back."""
        session_id = msg.get("session_id", "")
        content = msg.get("content", "")

        with self._lock:
            session = self._sessions.get(session_id)
            output_buf = self._output_buffers.get(session_id)

        if not session:
            self._send_to_proxy({
                "type": "error",
                "error": f"Unknown session: {session_id}",
                "request_id": req_id,
            })
            return

        import uuid
        message_id = f"msg-{uuid.uuid4().hex[:8]}"
        session.send_message(content, message_id)

        # Buffer the outgoing message
        if output_buf is not None:
            output_buf.append(f">>> {content}")
            if len(output_buf) > self._MAX_OUTPUT_LINES:
                output_buf[:] = output_buf[-self._MAX_OUTPUT_LINES:]

        # Stream events back until done
        while True:
            event = session.receive(timeout=3000)
            if event is None:
                self._send_to_proxy({
                    "type": "stream_event",
                    "event": {"type": "error", "error": "timeout"},
                    "done": True,
                    "request_id": req_id,
                })
                break

            # Buffer the event for monitor
            if output_buf is not None:
                event_type = event.get("type", "")
                if event_type == "activity":
                    line = f"  [{event.get('tool', '')}] {event.get('description', '')}"
                elif event_type == "response":
                    content_text = event.get("content", "")
                    line = f"<<< {content_text[:200]}"
                elif event_type == "error":
                    line = f"!!! {event.get('error', '')}"
                else:
                    line = json.dumps(event)
                output_buf.append(line)
                if len(output_buf) > self._MAX_OUTPUT_LINES:
                    output_buf[:] = output_buf[-self._MAX_OUTPUT_LINES:]

            # Forward to proxy
            is_done = (
                (event.get("type") == "response" and event.get("done", False))
                or event.get("type") == "error"
            )
            self._send_to_proxy({
                "type": "stream_event",
                "event": event,
                "done": is_done,
                "request_id": req_id,
            })

            if is_done:
                break

            if not session.is_alive:
                self._send_to_proxy({
                    "type": "stream_event",
                    "event": {"type": "error", "error": "Sub-agent exited"},
                    "done": True,
                    "request_id": req_id,
                })
                break

    def _handle_monitor(self, msg: dict, req_id: str) -> None:
        """Return the last N lines of a sub-agent's output."""
        session_id = msg.get("session_id", "")
        with self._lock:
            buf = self._output_buffers.get(session_id)
        if buf is None:
            self._send_to_proxy({
                "type": "error",
                "error": f"Unknown session: {session_id}",
                "request_id": req_id,
            })
            return
        self._send_to_proxy({
            "type": "monitor_result",
            "lines": list(buf),
            "request_id": req_id,
        })

    def _handle_stop(self, msg: dict, req_id: str) -> None:
        """Shutdown a sub-agent session."""
        session_id = msg.get("session_id", "")
        with self._lock:
            session = self._sessions.pop(session_id, None)
            self._output_buffers.pop(session_id, None)
            meta = self._session_meta.pop(session_id, None)
        if not session:
            self._send_to_proxy({
                "type": "error",
                "error": f"Unknown session: {session_id}",
                "request_id": req_id,
            })
            return
        try:
            patch = session.shutdown()
            # Apply patch to sub-agent's worktree and commit
            if patch and self._worktree_mgr:
                agent_name = getattr(session, "_agent_name", None)
                if agent_name:
                    wt_path = self._worktree_mgr._worktree_path(agent_name)
                    if wt_path.exists():
                        import subprocess as _sp
                        apply = _sp.run(
                            ["git", "apply", "-"],
                            input=patch, capture_output=True, cwd=str(wt_path),
                        )
                        if apply.returncode == 0:
                            self._worktree_mgr.commit_worktree(
                                agent_name, f"primordial: {agent_name} changes",
                            )
        except Exception as e:
            logger.warning("Error shutting down sub-agent %s: %s", session_id, e)
        self._send_to_proxy({
            "type": "stopped",
            "session_id": session_id,
            "request_id": req_id,
        })

    def save_session_mapping(self, state_dir: Path) -> None:
        """Save active sub-agent session mapping for resume."""
        with self._lock:
            mapping = []
            for sid, meta in self._session_meta.items():
                mapping.append({
                    "session_id": sid,
                    "agent_url": meta["agent_url"],
                    "session_name": meta["session_name"],
                })
        if mapping:
            mapping_file = state_dir / "delegation_sessions.json"
            mapping_file.parent.mkdir(parents=True, exist_ok=True)
            mapping_file.write_text(json.dumps(mapping))

    def shutdown(self) -> None:
        """Shutdown all sub-agent sessions and stop the handler."""
        self._stop.set()
        with self._lock:
            sessions_copy = list(self._sessions.items())
            self._sessions.clear()
            self._output_buffers.clear()
        for sid, session in sessions_copy:
            try:
                patch = session.shutdown()
                if patch and self._worktree_mgr:
                    agent_name = getattr(session, "_agent_name", None)
                    if agent_name:
                        wt_path = self._worktree_mgr._worktree_path(agent_name)
                        if wt_path.exists():
                            import subprocess as _sp
                            apply = _sp.run(
                                ["git", "apply", "-"],
                                input=patch, capture_output=True, cwd=str(wt_path),
                            )
                            if apply.returncode == 0:
                                self._worktree_mgr.commit_worktree(
                                    agent_name, f"primordial: {agent_name} changes",
                                )
            except Exception as e:
                logger.warning("Error shutting down sub-agent %s: %s", sid, e)
