"""Docker AI Sandbox manager for running agents in isolated MicroVMs."""

from __future__ import annotations

import json
import queue
import subprocess
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Optional

from agentstore.models import AgentManifest

# Base template for sandboxes — claude has Python pre-installed
SANDBOX_TEMPLATE_AGENT = "claude"

AGENT_DIR_IN_SANDBOX = "/home/agent/agent"
VENV_DIR = "/home/agent/venv"
VENV_PYTHON = "/home/agent/venv/bin/python"
STATE_DIR_IN_SANDBOX = "/home/agent/state"
AGENT_HOME_IN_SANDBOX = "/home/agent"
# Directories managed by the platform or ephemeral — excluded from state persistence
_STATE_EXCLUDE_DIRS = [
    "agent",            # Agent code (copied fresh each run)
    "venv",             # Python virtualenv (recreated each run)
    "workspace",        # User workspace (mounted, not ours to persist)
    "agentstore-sdk",   # SDK source (copied fresh each run)
    ".cache",           # pip/uv wheel cache (causes install corruption)
    ".local",           # pip/package manager metadata
    ".npm",             # npm cache
    ".docker",          # docker config (from sandbox template)
]

LLM_API_DOMAINS = [
    "api.anthropic.com",
    "api.openai.com",
    "api.groq.com",
    "generativelanguage.googleapis.com",
    "api.mistral.ai",
    "api.deepseek.com",
]


class SandboxError(Exception):
    pass


class SandboxManager:
    """Manages Docker AI Sandboxes for agent execution.

    Each agent run creates an isolated MicroVM sandbox with:
    - Deny-by-default network policy (only whitelisted LLM API domains)
    - Agent code transferred via tar pipe
    - Workspace directory mount (bidirectional sync)
    - Environment variable injection for API keys
    """

    @staticmethod
    def _exec_cmd(
        sandbox_name: str,
        command: list[str],
        env_vars: Optional[dict[str, str]] = None,
        interactive: bool = False,
    ) -> list[str]:
        """Build a 'docker sandbox exec' command with correct flag ordering."""
        cmd = ["docker", "sandbox", "exec"]
        if interactive:
            cmd.append("-i")
        if env_vars:
            for key, value in env_vars.items():
                cmd.extend(["-e", f"{key}={value}"])
        cmd.append(sandbox_name)
        cmd.extend(command)
        return cmd

    def _check_docker_sandbox(self) -> bool:
        try:
            result = subprocess.run(
                ["docker", "sandbox", "ls"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            return result.returncode == 0
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return False

    def _get_allowed_domains(self, manifest: AgentManifest) -> list[str]:
        domains = set(LLM_API_DOMAINS)
        for net_perm in manifest.permissions.network:
            domains.add(net_perm.domain)
        domains.add("pypi.org")
        domains.add("files.pythonhosted.org")
        return sorted(domains)

    def create_sandbox(
        self,
        name: str,
        workspace: Path,
    ) -> str:
        """Create a Docker AI Sandbox."""
        workspace.mkdir(parents=True, exist_ok=True)

        cmd = [
            "docker", "sandbox", "create",
            "--name", name,
            SANDBOX_TEMPLATE_AGENT,
            str(workspace),
        ]

        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=120,
            )
            if result.returncode != 0:
                raise SandboxError(
                    f"Failed to create sandbox: {result.stderr.strip()}"
                )
        except subprocess.TimeoutExpired:
            raise SandboxError("Timeout creating sandbox")

        return name

    def _apply_network_policy(
        self, name: str, manifest: AgentManifest,
    ) -> None:
        """Apply deny-by-default network policy after deps are installed."""
        proxy_cmd = [
            "docker", "sandbox", "network", "proxy", name,
            "--policy", "deny",
        ]
        for domain in self._get_allowed_domains(manifest):
            proxy_cmd.extend(["--allow-host", domain])

        try:
            subprocess.run(
                proxy_cmd, capture_output=True, text=True, timeout=30,
            )
        except subprocess.TimeoutExpired:
            pass

    def _copy_state_to_sandbox(
        self, sandbox_name: str, state_dir: Path,
    ) -> None:
        """Restore agent's home directory state from a previous run."""
        if not state_dir.exists() or not any(state_dir.iterdir()):
            return

        tar_proc = subprocess.Popen(
            ["tar", "cf", "-", "-C", str(state_dir), "."],
            stdout=subprocess.PIPE,
        )
        extract_cmd = self._exec_cmd(
            sandbox_name,
            ["bash", "-c", f"tar xf - -C {AGENT_HOME_IN_SANDBOX}"],
            interactive=True,
        )
        extract_proc = subprocess.Popen(
            extract_cmd,
            stdin=tar_proc.stdout,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        tar_proc.stdout.close()
        _, stderr = extract_proc.communicate(timeout=60)
        if extract_proc.returncode != 0:
            raise SandboxError(
                f"Failed to restore state to sandbox: {stderr.strip()}"
            )

    def _copy_state_from_sandbox(
        self, sandbox_name: str, state_dir: Path,
    ) -> None:
        """Snapshot the agent's home directory back to host for next run."""
        state_dir.mkdir(parents=True, exist_ok=True)

        exclude_args = " ".join(
            f"--exclude='./{d}'" for d in _STATE_EXCLUDE_DIRS
        )
        tar_cmd = self._exec_cmd(
            sandbox_name,
            ["bash", "-c", f"tar cf - {exclude_args} -C {AGENT_HOME_IN_SANDBOX} . 2>/dev/null || true"],
            interactive=True,
        )
        tar_proc = subprocess.Popen(
            tar_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        extract_proc = subprocess.Popen(
            ["tar", "xf", "-", "-C", str(state_dir)],
            stdin=tar_proc.stdout,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        tar_proc.stdout.close()
        extract_proc.communicate(timeout=60)

    def _copy_agent_to_sandbox(
        self, sandbox_name: str, agent_dir: Path,
    ) -> None:
        """Copy agent code into the sandbox via tar pipe."""
        tar_proc = subprocess.Popen(
            ["tar", "cf", "-", "-C", str(agent_dir), "."],
            stdout=subprocess.PIPE,
        )
        extract_cmd = self._exec_cmd(
            sandbox_name,
            ["bash", "-c", f"mkdir -p {AGENT_DIR_IN_SANDBOX} && tar xf - -C {AGENT_DIR_IN_SANDBOX}"],
            interactive=True,
        )
        extract_proc = subprocess.Popen(
            extract_cmd,
            stdin=tar_proc.stdout,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        tar_proc.stdout.close()
        _, stderr = extract_proc.communicate(timeout=60)
        if extract_proc.returncode != 0:
            raise SandboxError(
                f"Failed to copy agent code to sandbox: {stderr.strip()}"
            )

    def _create_venv(self, sandbox_name: str) -> None:
        """Create a Python virtual environment inside the sandbox using uv."""
        exec_cmd = self._exec_cmd(
            sandbox_name, ["uv", "venv", VENV_DIR],
        )
        result = subprocess.run(
            exec_cmd, capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            error_detail = result.stderr.strip() or result.stdout.strip()
            raise SandboxError(f"Failed to create venv: {error_detail[:300]}")

    def _uv_install(
        self, sandbox_name: str, install_args: list[str],
    ) -> None:
        """Run 'uv pip install' targeting the sandbox venv."""
        cmd = ["uv", "pip", "install", "--python", VENV_PYTHON] + install_args
        exec_cmd = self._exec_cmd(sandbox_name, cmd)
        result = subprocess.run(
            exec_cmd, capture_output=True, text=True, timeout=300,
        )
        if result.returncode != 0:
            error_detail = result.stderr.strip() or result.stdout.strip()
            raise SandboxError(
                f"Failed to install packages: {error_detail[:500]}"
            )

    def _install_dependencies(
        self,
        sandbox_name: str,
        manifest: AgentManifest,
        env_vars: dict[str, str],
    ) -> None:
        """Install Python dependencies inside the sandbox using uv."""
        deps_name = manifest.runtime.dependencies
        if deps_name.endswith("pyproject.toml"):
            self._uv_install(sandbox_name, [f"{AGENT_DIR_IN_SANDBOX}/"])
        else:
            self._uv_install(sandbox_name, ["-r", f"{AGENT_DIR_IN_SANDBOX}/{deps_name}"])

    def _copy_sdk_to_sandbox(self, sandbox_name: str) -> bool:
        """Copy the agentstore-sdk source into the sandbox. Returns True if copied."""
        sdk_dir = Path(__file__).resolve().parents[5] / "sdk"
        if not (sdk_dir / "pyproject.toml").exists():
            return False

        tar_proc = subprocess.Popen(
            ["tar", "cf", "-", "-C", str(sdk_dir), "."],
            stdout=subprocess.PIPE,
        )
        extract_cmd = self._exec_cmd(
            sandbox_name,
            ["bash", "-c", "mkdir -p /home/agent/agentstore-sdk && tar xf - -C /home/agent/agentstore-sdk"],
            interactive=True,
        )
        extract_proc = subprocess.Popen(
            extract_cmd,
            stdin=tar_proc.stdout,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        tar_proc.stdout.close()
        extract_proc.communicate(timeout=60)
        return True

    def _setup_sandbox(
        self,
        sandbox_name: str,
        agent_dir: Path,
        manifest: AgentManifest,
        workspace: Path,
        env_vars: dict[str, str],
        state_dir: Optional[Path] = None,
        on_status: Optional[callable] = None,
    ) -> None:
        """Full sandbox setup: create, copy code, install SDK + deps, lock network."""
        def _status(msg: str) -> None:
            if on_status:
                on_status(msg)

        _status("Creating sandbox...")
        self.create_sandbox(sandbox_name, workspace)

        _status("Copying agent code + setting up Python environment...")
        errors: list[str] = []

        def _do_copy():
            try:
                self._copy_agent_to_sandbox(sandbox_name, agent_dir)
            except SandboxError as e:
                errors.append(str(e))

        def _do_venv():
            try:
                self._create_venv(sandbox_name)
            except SandboxError as e:
                errors.append(str(e))

        def _do_state():
            try:
                if state_dir:
                    self._copy_state_to_sandbox(sandbox_name, state_dir)
            except SandboxError as e:
                errors.append(str(e))

        with ThreadPoolExecutor(max_workers=3) as pool:
            pool.submit(_do_copy)
            pool.submit(_do_venv)
            pool.submit(_do_state)

        if errors:
            raise SandboxError(errors[0])

        _status("Installing Agent Store SDK...")
        sdk_copied = self._copy_sdk_to_sandbox(sandbox_name)
        if sdk_copied:
            self._uv_install(sandbox_name, ["/home/agent/agentstore-sdk/"])

        deps_file = agent_dir / manifest.runtime.dependencies
        if deps_file.exists():
            _status("Installing dependencies...")
            self._install_dependencies(sandbox_name, manifest, env_vars)

        _status("Applying network policy...")
        self._apply_network_policy(sandbox_name, manifest)

    def run_agent(
        self,
        agent_dir: Path,
        manifest: AgentManifest,
        workspace: Path,
        env_vars: dict[str, str],
        state_dir: Optional[Path] = None,
        on_status: Optional[callable] = None,
    ) -> AgentSession:
        """Start an agent session.

        Returns an AgentSession that the caller uses to send/receive
        NDJSON messages. The caller is responsible for calling session.shutdown()
        when done.
        """
        if not self._check_docker_sandbox():
            raise SandboxError(
                "Docker AI Sandbox support not available. "
                "Install Docker Desktop 4.40+ with sandbox support enabled. "
                "See: https://docs.docker.com/ai/sandboxes/"
            )

        sandbox_name = f"as-{manifest.name}-{uuid.uuid4().hex[:8]}"
        self._setup_sandbox(
            sandbox_name, agent_dir, manifest, workspace, env_vars,
            state_dir=state_dir, on_status=on_status,
        )

        module_path, func_name = manifest.runtime.entry_point.rsplit(":", 1)

        bootstrap_script = f"""
import sys
sys.path.insert(0, '{AGENT_DIR_IN_SANDBOX}/src')
sys.path.insert(0, '{AGENT_DIR_IN_SANDBOX}')
from {module_path.replace('/', '.')} import {func_name}
agent = {func_name}()
agent.run_loop()
"""

        exec_cmd = self._exec_cmd(
            sandbox_name,
            [VENV_PYTHON, "-u", "-c", bootstrap_script],
            env_vars=env_vars,
            interactive=True,
        )

        proc = subprocess.Popen(
            exec_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

        return AgentSession(
            process=proc,
            sandbox_name=sandbox_name,
            manager=self,
            state_dir=state_dir,
        )

    def _destroy_sandbox(self, name: str) -> None:
        """Stop and remove a sandbox."""
        try:
            subprocess.run(
                ["docker", "sandbox", "stop", name],
                capture_output=True, text=True, timeout=15,
            )
        except Exception:
            pass
        try:
            subprocess.run(
                ["docker", "sandbox", "rm", name],
                capture_output=True, text=True, timeout=30,
            )
        except Exception:
            pass

    def list_sandboxes(self) -> list[dict]:
        try:
            result = subprocess.run(
                ["docker", "sandbox", "ls", "--format", "json"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode == 0 and result.stdout.strip():
                sandboxes = json.loads(result.stdout)
                return [
                    s for s in sandboxes
                    if s.get("Name", "").startswith("as-")
                ]
            return []
        except Exception:
            return []


class AgentSession:
    """Wraps a running agent process with NDJSON communication."""

    def __init__(
        self,
        process: subprocess.Popen,
        sandbox_name: str,
        manager: SandboxManager,
        state_dir: Optional[Path] = None,
    ):
        self._proc = process
        self._sandbox_name = sandbox_name
        self._manager = manager
        self._state_dir = state_dir
        self._messages: queue.Queue[dict[str, Any]] = queue.Queue()
        self._alive = True

        self._reader = threading.Thread(target=self._read_stdout, daemon=True)
        self._reader.start()

    def _read_stdout(self) -> None:
        """Read NDJSON lines from agent stdout in a background thread."""
        try:
            for line in self._proc.stdout:
                line = line.strip()
                if not line:
                    continue
                try:
                    msg = json.loads(line)
                    self._messages.put(msg)
                except json.JSONDecodeError:
                    continue
        except (ValueError, OSError):
            pass
        finally:
            self._alive = False

    @property
    def is_alive(self) -> bool:
        return self._alive and self._proc.poll() is None

    def send_message(self, content: str, message_id: str) -> None:
        """Send a message to the agent."""
        msg = json.dumps({
            "type": "message", "content": content, "message_id": message_id,
        })
        self._proc.stdin.write(msg + "\n")
        self._proc.stdin.flush()

    def receive(self, timeout: float = 60.0) -> Optional[dict[str, Any]]:
        """Receive the next NDJSON message from the agent. Returns None on timeout."""
        try:
            return self._messages.get(timeout=timeout)
        except queue.Empty:
            return None

    def wait_ready(self, timeout: float = 120.0) -> bool:
        """Wait for the agent to send a 'ready' message."""
        msg = self.receive(timeout=timeout)
        if msg and msg.get("type") == "ready":
            return True
        return False

    def shutdown(self) -> None:
        """Gracefully shutdown the agent and destroy the sandbox."""
        try:
            if self.is_alive:
                shutdown_msg = json.dumps({"type": "shutdown"})
                self._proc.stdin.write(shutdown_msg + "\n")
                self._proc.stdin.flush()
                self._proc.wait(timeout=10)
        except Exception:
            pass
        finally:
            if self._proc.poll() is None:
                self._proc.kill()
            if self._state_dir:
                try:
                    self._manager._copy_state_from_sandbox(
                        self._sandbox_name, self._state_dir,
                    )
                except Exception:
                    pass
            self._manager._destroy_sandbox(self._sandbox_name)
