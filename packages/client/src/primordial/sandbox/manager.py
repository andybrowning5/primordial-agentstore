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

from primordial.models import AgentManifest, _PROTECTED_ENV_VARS

_PROXY_SCRIPT = Path(__file__).parent / "proxy_script.py"
_PROXY_PATH_IN_SANDBOX = "/opt/_primordial_proxy.py"

# Well-known provider defaults for the in-sandbox reverse proxy.
_PROVIDER_DEFAULTS: dict[str, dict[str, str]] = {
    "anthropic": {"domain": "api.anthropic.com", "base_url_env": "ANTHROPIC_BASE_URL", "auth_style": "x-api-key"},
    "openai":    {"domain": "api.openai.com",    "base_url_env": "OPENAI_BASE_URL",    "auth_style": "bearer"},
    "google":    {"domain": "generativelanguage.googleapis.com", "base_url_env": "GOOGLE_BASE_URL", "auth_style": "bearer"},
    "groq":      {"domain": "api.groq.com",      "base_url_env": "GROQ_BASE_URL",      "auth_style": "bearer"},
    "mistral":   {"domain": "api.mistral.ai",    "base_url_env": "MISTRAL_BASE_URL",   "auth_style": "bearer"},
    "deepseek":  {"domain": "api.deepseek.com",  "base_url_env": "DEEPSEEK_BASE_URL",  "auth_style": "bearer"},
}

AGENT_HOME_IN_SANDBOX = "/home/user"
AGENT_DIR_IN_SANDBOX = "/home/user/agent"
WORKSPACE_DIR_IN_SANDBOX = "/home/user/workspace"
SKILL_FILE = Path(__file__).parent / "skill.md"
SKILL_DEST = "/home/user/skill.md"
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

        # Auto-allow API domains ONLY for known providers.
        # Custom domains from manifests are NOT auto-allowed to prevent
        # network firewall bypass via malicious domain declarations.
        for key_req in manifest.keys:
            defaults = _PROVIDER_DEFAULTS.get(key_req.provider.lower(), {})
            known_domain = defaults.get("domain")
            if known_domain and known_domain not in allowed:
                allowed.append(known_domain)

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

        session_token = f"sess-{secrets.token_hex(16)}"
        routes: list[dict[str, Any]] = []
        agent_envs: dict[str, str] = {}
        port = 9001

        # Build set of known provider env var names for cross-provider theft detection
        _known_provider_env_vars = {
            f"{p.upper().replace('-', '_')}_API_KEY" for p in _PROVIDER_DEFAULTS
        }

        for key_req in manifest.keys:
            env_name = key_req.resolved_env_var()
            real_key = env_vars.get(env_name)
            if not real_key:
                continue

            defaults = _PROVIDER_DEFAULTS.get(key_req.provider.lower(), {})

            # SECURITY: Prevent unknown providers from claiming known provider
            # env var names (e.g., provider: "evil" with env_var: "ANTHROPIC_API_KEY"
            # would steal the real Anthropic key and route it to attacker.com).
            if not defaults and env_name in _known_provider_env_vars:
                raise SandboxError(
                    f"Unknown provider {key_req.provider!r} cannot use "
                    f"known provider env var {env_name!r}"
                )
            known_domain = defaults.get("domain")
            # SECURITY: For known providers, ALWAYS use the known domain.
            # This prevents manifests from redirecting real API keys to
            # attacker-controlled servers via custom domain declarations.
            if known_domain:
                domain = known_domain  # ignore manifest domain override
            else:
                domain = key_req.domain
            if not domain:
                continue

            auth_style = key_req.auth_style or defaults.get("auth_style", "bearer")
            base_url_env = key_req.base_url_env or defaults.get(
                "base_url_env", f"{key_req.provider.upper().replace('-', '_')}_BASE_URL"
            )

            # SECURITY: Recheck auto-generated base_url_env against protected vars,
            # but only for unknown providers. Known providers use their own
            # base_url_env names which are legitimately in the protected set.
            if not defaults and base_url_env in _PROTECTED_ENV_VARS:
                raise SandboxError(
                    f"Auto-generated base_url_env {base_url_env!r} conflicts with "
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
        sandbox = Sandbox.create(
            template=manifest.runtime.e2b_template,
            envs=safe_envs,
            **network_kwargs,
        )

        try:
            _status("Uploading agent code...")
            self._upload_directory(sandbox, agent_dir, AGENT_DIR_IN_SANDBOX)

            sandbox.commands.run(f"mkdir -p {WORKSPACE_DIR_IN_SANDBOX}")

            self._upload_skill(sandbox)

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

            if manifest.runtime.setup_command:
                _status("Running setup command...")
                result = sandbox.commands.run(
                    f"cd {AGENT_DIR_IN_SANDBOX} && {manifest.runtime.setup_command}",
                    timeout=600,
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
            if self._proxy_pid:
                try:
                    self._sandbox.commands.run(f"kill {self._proxy_pid}", user="root")
                except Exception:
                    pass
            try:
                self._sandbox.kill()
            except Exception:
                pass
