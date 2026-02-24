"""E2B sandbox manager for running agents in isolated Firecracker microVMs."""

from __future__ import annotations

import io
import json
import logging
import os
import queue
import secrets
import tarfile
import threading
from pathlib import Path
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

from e2b import Sandbox
from e2b.sandbox.commands.command_handle import PtySize

from primordial.models import AgentManifest, _PROTECTED_ENV_VARS

_PROXY_SCRIPT = Path(__file__).parent / "proxy_script.py"
_PROXY_PATH_IN_SANDBOX = "/opt/_primordial_proxy.py"
_DELEGATION_PROXY_SCRIPT = Path(__file__).parent / "delegation_proxy.py"
_DELEGATION_PROXY_PATH = "/opt/_primordial_delegation.py"

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
                # SECURITY: Only extract members with safe paths.
                # Rejects absolute paths, ".." traversal, and symlinks.
                safe_members = []
                for member in tar_stream.getmembers():
                    if member.name.startswith("/") or ".." in member.name.split("/"):
                        continue
                    if member.issym() or member.islnk():
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
            if key_req.passthrough:
                continue  # passthrough keys bypass proxy entirely
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

        # Wait for proxy to bind
        first_port = routes[0]["port"]
        sandbox.commands.run(
            f"python3 -c \""
            f"import socket, time\n"
            f"for _ in range(30):\n"
            f"    try: s=socket.create_connection(('127.0.0.1',{first_port}),1); s.close(); break\n"
            f"    except OSError: time.sleep(0.2)\n"
            f"\"",
            user="root",
        )

        return proxy_pid, agent_envs

    def _build_run_command(
        self,
        sandbox: Sandbox,
        manifest: AgentManifest,
        agent_envs: dict[str, str],
    ) -> str:
        """Build the command to start the agent, injecting proxy env vars."""
        if not agent_envs:
            return f"cd {AGENT_DIR_IN_SANDBOX} && {manifest.runtime.run_command}"

        # SECURITY: Use inline env assignment instead of a persistent wrapper
        # script. This prevents the agent from reading proxy config from disk.
        # Values are shell-escaped to prevent injection via env_var names.
        env_prefix = " ".join(
            f"{k}={_shell_escape(v)}" for k, v in agent_envs.items()
        )
        return f"cd {AGENT_DIR_IN_SANDBOX} && {env_prefix} exec {manifest.runtime.run_command}"

    def _start_delegation_proxy(
        self,
        sandbox: Sandbox,
        manifest: AgentManifest,
        env_vars: dict[str, str],
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
        # 30 min timeout — delegation scenarios with nested sub-agents
        # can take several minutes just for setup.
        sandbox = Sandbox.create(
            template=manifest.runtime.e2b_template,
            envs=safe_envs,
            timeout=1800,
            **network_kwargs,
        )

        try:
            _status("Uploading agent code...")
            self._upload_directory(sandbox, agent_dir, AGENT_DIR_IN_SANDBOX)

            sandbox.commands.run(f"mkdir -p {WORKSPACE_DIR_IN_SANDBOX}")

            if state_dir:
                _status("Restoring state...")
                self._restore_state(sandbox, state_dir)

            # SECURITY: Apply hardening BEFORE setup_command runs.
            # This prevents malicious setup commands from reading /proc,
            # escalating privileges, or planting background watchers.
            _status("Hardening sandbox...")
            self._apply_hardening(sandbox, needs_proxy=bool(manifest.keys))

            # --- Start in-sandbox reverse proxy for API key isolation ---
            # SECURITY: Proxy starts BEFORE setup_command to prevent malicious
            # setup from pre-binding proxy ports and intercepting API traffic.
            proxy_pid, agent_envs = None, {}
            if manifest.keys:
                _status("Starting security proxy...")
                proxy_pid, agent_envs = self._start_proxy(sandbox, manifest, env_vars)

            # --- Start delegation proxy for agent-to-agent delegation ---
            delegation_handler = None
            if manifest.permissions.delegation.enabled:
                _status("Starting delegation proxy...")
                delegation_handler = self._start_delegation_proxy(
                    sandbox, manifest, env_vars,
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
            )
        except Exception:
            try:
                sandbox.kill()
            except Exception:
                pass
            raise

    def run_agent_terminal(
        self,
        agent_dir: Path,
        manifest: AgentManifest,
        workspace: Path,
        env_vars: dict[str, str],
        cols: int = 80,
        rows: int = 24,
        on_data: Optional[Callable[[bytes], None]] = None,
        state_dir: Optional[Path] = None,
        on_status: Optional[Callable[[str], None]] = None,
    ) -> "TerminalSession":
        """Start an agent in terminal passthrough mode using E2B PTY.

        Instead of NDJSON protocol, the agent's stdin/stdout are connected
        directly to a pseudo-terminal for raw interactive use.
        """
        self._ensure_e2b_api_key(env_vars)

        def _status(msg: str) -> None:
            if on_status:
                on_status(msg)

        _status("Creating sandbox...")
        network_kwargs = self._build_network_kwargs(manifest)

        _SAFE_ENV_ALLOWLIST = {
            "PATH", "HOME", "USER", "SHELL", "LANG", "LC_ALL",
            "LC_CTYPE", "TERM", "TZ", "PYTHONPATH", "NODE_PATH",
        }
        safe_envs = {
            k: v for k, v in env_vars.items()
            if k in _SAFE_ENV_ALLOWLIST
        }
        # 30 min timeout — delegation scenarios with nested sub-agents
        # can take several minutes just for setup.
        sandbox = Sandbox.create(
            template=manifest.runtime.e2b_template,
            envs=safe_envs,
            timeout=1800,
            **network_kwargs,
        )

        try:
            _status("Uploading agent code...")
            self._upload_directory(sandbox, agent_dir, AGENT_DIR_IN_SANDBOX)
            sandbox.commands.run(f"mkdir -p {WORKSPACE_DIR_IN_SANDBOX}")

            if state_dir:
                _status("Restoring state...")
                self._restore_state(sandbox, state_dir)

            _status("Hardening sandbox...")
            self._apply_hardening(sandbox, needs_proxy=bool(manifest.keys))

            proxy_pid, agent_envs = None, {}
            if manifest.keys:
                _status("Starting security proxy...")
                proxy_pid, agent_envs = self._start_proxy(sandbox, manifest, env_vars)

            delegation_handler = None
            if manifest.permissions.delegation.enabled:
                _status("Starting delegation proxy...")
                delegation_handler = self._start_delegation_proxy(
                    sandbox, manifest, env_vars,
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

            # Pre-configure Claude Code onboarding so it uses ANTHROPIC_API_KEY
            # without prompting for login (only for claude-code agents)
            if "claude" in (manifest.runtime.run_command or "").lower():
                api_key_for_config = agent_envs.get("ANTHROPIC_API_KEY", "")
                claude_config = json.dumps({
                    "hasCompletedOnboarding": True,
                    "primaryApiKey": api_key_for_config,
                    "apiKeySource": "environment",
                })
                sandbox.commands.run(
                    f"mkdir -p /home/user/.claude && "
                    f"echo '{claude_config}' > /home/user/.claude.json && "
                    f"chown user:user /home/user/.claude.json /home/user/.claude",
                    user="root",
                )

            _status("Starting terminal...")

            # Build env vars — include proxy vars + terminal-mode extras
            pty_envs = {
                **agent_envs,
                "IS_DEMO": "true",
                "DISABLE_AUTOUPDATER": "1",
                "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
            }

            # Pass through env vars declared in manifest with passthrough=true
            for key_req in (manifest.keys or []):
                if getattr(key_req, "passthrough", False):
                    target_env = key_req.resolved_env_var()
                    # Vault stores keys as <PROVIDER>_API_KEY
                    vault_env = f"{key_req.provider.upper().replace('-', '_')}_API_KEY"
                    val = env_vars.get(vault_env)
                    if val:
                        pty_envs[target_env] = val

            # Build the full command with inline env vars for reliable propagation
            run_cmd = manifest.runtime.run_command or "bash"
            env_prefix = " ".join(
                f"{k}={_shell_escape(v)}" for k, v in pty_envs.items()
            )
            full_cmd = f"{env_prefix} exec {run_cmd}"

            # Create PTY (starts bash -i -l)
            pty_handle = sandbox.pty.create(
                size=PtySize(rows=rows, cols=cols),
                user="user",
                cwd=AGENT_DIR_IN_SANDBOX,
                timeout=0,
            )

            # Drive PTY output in a background thread
            session = TerminalSession(
                sandbox=sandbox,
                pty_handle=pty_handle,
                manager=self,
                state_dir=state_dir,
                proxy_pid=proxy_pid,
                delegation_handler=delegation_handler,
                on_data=on_data,
            )

            # Type the run command into bash with env vars
            sandbox.pty.send_stdin(
                pty_handle.pid,
                f"{full_cmd}\n".encode(),
            )

            return session
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

    def shutdown(self) -> None:
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
                self._reader_thread.join(timeout=10)
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


class TerminalSession:
    """Wraps a PTY session in an E2B sandbox for raw terminal passthrough."""

    def __init__(
        self,
        sandbox: Sandbox,
        pty_handle: Any,
        manager: SandboxManager,
        state_dir: Optional[Path] = None,
        proxy_pid: Optional[int] = None,
        delegation_handler: Optional["DelegationHandler"] = None,
        on_data: Optional[Callable[[bytes], None]] = None,
    ):
        self._sandbox = sandbox
        self._pty = pty_handle
        self._manager = manager
        self._state_dir = state_dir
        self._proxy_pid = proxy_pid
        self._delegation_handler = delegation_handler
        self._on_data = on_data
        self._alive = True

        self._wait_thread: Optional[threading.Thread] = None

    def start_output(self) -> None:
        """Start forwarding PTY output. Call after setup UI is cleared."""
        self._wait_thread = threading.Thread(target=self._drive_pty, daemon=True)
        self._wait_thread.start()

    def _drive_pty(self) -> None:
        try:
            self._pty.wait(
                on_pty=self._on_data,
            )
        except Exception:
            pass
        finally:
            self._alive = False

    @property
    def is_alive(self) -> bool:
        return self._alive

    def send_input(self, data: bytes) -> None:
        self._sandbox.pty.send_stdin(self._pty.pid, data)

    def resize(self, cols: int, rows: int) -> None:
        try:
            self._sandbox.pty.resize(self._pty.pid, size=PtySize(rows=rows, cols=cols))
        except Exception:
            pass

    def shutdown(self) -> None:
        try:
            if self._delegation_handler:
                try:
                    self._delegation_handler.shutdown()
                except Exception as e:
                    logger.warning("Failed to shutdown delegation handler: %s", e)
        except Exception:
            pass
        finally:
            if self._state_dir:
                try:
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


class DelegationHandler:
    """Host-side handler for agent delegation requests.

    Reads NDJSON commands from the delegation proxy's stdout, processes them
    (search, run, message, monitor, stop), and writes responses back via stdin.
    Each sub-agent runs in its own fresh E2B sandbox.
    """

    _MAX_OUTPUT_LINES = 1000

    def __init__(
        self,
        sandbox: Sandbox,
        deleg_handle: Any,
        manifest: AgentManifest,
        env_vars: dict[str, str],
        manager: SandboxManager,
    ):
        self._sandbox = sandbox
        self._deleg_handle = deleg_handle
        self._manifest = manifest
        self._env_vars = env_vars
        self._manager = manager
        self._sessions: dict[str, AgentSession] = {}
        self._output_buffers: dict[str, list[str]] = {}
        self._session_meta: dict[str, dict] = {}  # session_id -> {agent_url, session_name}
        self._messages: queue.Queue[dict[str, Any]] = queue.Queue()
        self._ready = threading.Event()
        self._stop = threading.Event()
        self._session_counter = 0
        self._lock = threading.Lock()

        # FastEmbed model (lazy-loaded)
        self._embed_model = None

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
                    # Spawn in a separate thread so multiple agents can
                    # be created concurrently.
                    threading.Thread(
                        target=self._handle_run, args=(msg, req_id),
                        daemon=True,
                    ).start()
                elif cmd == "message":
                    self._handle_message(msg, req_id)
                elif cmd == "monitor":
                    self._handle_monitor(msg, req_id)
                elif cmd == "stop":
                    self._handle_stop(msg, req_id)
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

    def _fetch_agents(self, query: str | None = None) -> list[dict]:
        """Fetch agents from GitHub API."""
        import httpx
        topic_query = "topic:primordial-agent"
        q = f"{topic_query} {query}" if query else topic_query
        resp = httpx.get(
            "https://api.github.com/search/repositories",
            params={"q": q, "sort": "stars", "order": "desc", "per_page": 100},
            headers={"Accept": "application/vnd.github.v3+json"},
            timeout=10,
        )
        resp.raise_for_status()
        items = resp.json().get("items", [])
        return [
            {
                "name": r["full_name"],
                "description": r.get("description") or "",
                "url": r["html_url"],
                "stars": r.get("stargazers_count", 0),
            }
            for r in items
        ]

    def _get_embed_model(self):
        """Lazy-load the FastEmbed model."""
        if self._embed_model is None:
            try:
                from fastembed import TextEmbedding
                self._embed_model = TextEmbedding()
            except ImportError:
                logger.warning("fastembed not installed, falling back to keyword search")
                return None
        return self._embed_model

    def _semantic_rank(self, query: str, agents: list[dict], top_k: int = 5) -> list[dict]:
        """Rank agents by semantic similarity to query using FastEmbed."""
        import numpy as np

        model = self._get_embed_model()
        if not model or not agents:
            # Fallback: simple substring matching
            query_lower = query.lower()
            scored = []
            for a in agents:
                text = f"{a['name']} {a['description']}".lower()
                score = sum(1 for word in query_lower.split() if word in text)
                scored.append((score, a))
            scored.sort(key=lambda x: -x[0])
            return [a for _, a in scored[:top_k]]

        descriptions = [
            f"{a['name']}: {a['description']}" for a in agents
        ]
        query_emb = list(model.embed([query]))[0]
        doc_embs = list(model.embed(descriptions))
        doc_arr = np.array(doc_embs)
        query_arr = np.array(query_emb)

        # Cosine similarity
        norms = np.linalg.norm(doc_arr, axis=1) * np.linalg.norm(query_arr)
        norms[norms == 0] = 1.0
        similarities = doc_arr @ query_arr / norms
        top_indices = (-similarities).argsort()[:top_k]

        return [agents[i] for i in top_indices]

    def _handle_search(self, msg: dict, req_id: str) -> None:
        """Semantic search for agents."""
        query = msg.get("query", "")
        agents = self._fetch_agents(query)
        ranked = self._semantic_rank(query, agents, top_k=5)
        self._send_to_proxy({
            "type": "search_result",
            "agents": ranked,
            "request_id": req_id,
        })

    def _handle_search_all(self, req_id: str) -> None:
        """List all agents sorted by stars."""
        agents = self._fetch_agents()
        self._send_to_proxy({
            "type": "search_result",
            "agents": agents,
            "request_id": req_id,
        })

    def _handle_run(self, msg: dict, req_id: str) -> None:
        """Spawn a sub-agent and return a session ID."""
        agent_url = msg.get("agent_url", "")
        if not agent_url:
            self._send_to_proxy({
                "type": "error",
                "error": "agent_url is required",
                "request_id": req_id,
            })
            return

        # Validate against allowed_agents if set
        allowed = self._manifest.permissions.delegation.allowed_agents
        if allowed:
            # Check if URL matches any allowed agent pattern
            matched = any(
                a in agent_url for a in allowed
            )
            if not matched:
                self._send_to_proxy({
                    "type": "error",
                    "error": f"Agent not in allowed_agents list: {agent_url}",
                    "request_id": req_id,
                })
                return

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

            # Generate session ID (thread-safe for concurrent spawns)
            with self._lock:
                self._session_counter += 1
                session_id = f"deleg-{self._session_counter}"
            session_name = f"sub-{secrets.token_hex(4)}"

            # Determine state dir for sub-agent
            from primordial.config import get_config
            config = get_config()
            sub_state_dir = config.session_state_dir(sub_manifest.name, session_name)

            # Resolve sub-agent's API keys from the vault
            from primordial.security.key_vault import KeyVault
            import click
            vault = KeyVault(config.keys_file)
            sub_providers = [kr.provider for kr in sub_manifest.keys] if sub_manifest.keys else []
            sub_providers.append("e2b")  # Always needed for sandbox creation

            # Check for missing required keys and prompt the user.
            # Use _input_lock to serialize prompts across concurrent spawns.
            # Re-check the vault after acquiring the lock — another thread may
            # have already stored the key we need.
            if sub_manifest.keys:
                missing = [kr for kr in sub_manifest.keys if kr.required and not vault.get_key(kr.provider)]
                if missing:
                    with self._input_lock:
                        # Re-check: another thread may have stored the key
                        vault = KeyVault(config.keys_file)
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
                                    return
                            console.print()
                            self.input_active = False
                            if self.on_input_done:
                                self.on_input_done()

            sub_env_vars = vault.get_env_vars(providers=sub_providers)

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

            sub_session = self._manager.run_agent(
                agent_dir=agent_dir,
                manifest=sub_manifest,
                workspace=Path("."),
                env_vars=sub_env_vars,
                state_dir=sub_state_dir,
                on_status=_on_status,
            )

            if not sub_session.wait_ready(timeout=1200):
                sub_session.shutdown()
                self._send_to_proxy({
                    "type": "error",
                    "error": "Sub-agent failed to start",
                    "request_id": req_id,
                })
                return

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
                "request_id": req_id,
            })

        except Exception as e:
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
            self._session_meta.pop(session_id, None)
        if not session:
            self._send_to_proxy({
                "type": "error",
                "error": f"Unknown session: {session_id}",
                "request_id": req_id,
            })
            return
        try:
            session.shutdown()
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
            for sid, session in list(self._sessions.items()):
                try:
                    session.shutdown()
                except Exception as e:
                    logger.warning("Error shutting down sub-agent %s: %s", sid, e)
            self._sessions.clear()
            self._output_buffers.clear()
