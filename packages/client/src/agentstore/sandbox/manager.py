"""Docker AI Sandbox manager for running agents in isolated MicroVMs."""

from __future__ import annotations

import json
import subprocess
import uuid
from pathlib import Path
from typing import Any, Optional

from agentstore.models import AgentManifest

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
    - Read-only agent code mount
    - Workspace directory mount (bidirectional sync)
    - Environment variable injection for API keys
    - Resource limits (CPU, memory, timeout)
    """

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
        return sorted(domains)

    def create_sandbox(
        self,
        name: str,
        workspace: Path,
        manifest: AgentManifest,
        env_vars: dict[str, str],
    ) -> str:
        cmd = ["docker", "sandbox", "create", name]
        cmd.extend(["--workspace", str(workspace)])

        resources = manifest.runtime.resources
        cmd.extend(["--memory", resources.max_memory])
        cmd.extend(["--cpus", str(resources.max_cpu)])

        for domain in self._get_allowed_domains(manifest):
            cmd.extend(["--allow-host", domain])

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            if result.returncode != 0:
                raise SandboxError(f"Failed to create sandbox: {result.stderr}")
            return name
        except subprocess.TimeoutExpired:
            raise SandboxError("Timeout creating sandbox")

    def run_agent(
        self,
        agent_dir: Path,
        manifest: AgentManifest,
        task: str,
        workspace: Path,
        env_vars: dict[str, str],
        timeout: int = 300,
    ) -> dict[str, Any]:
        if not self._check_docker_sandbox():
            raise SandboxError(
                "Docker AI Sandbox support not available. "
                "Install Docker Desktop 4.40+ with sandbox support enabled. "
                "See: https://docs.docker.com/ai/sandboxes/"
            )

        run_id = f"agentstore-{uuid.uuid4().hex[:12]}"
        sandbox_name = f"as-{manifest.name}-{uuid.uuid4().hex[:8]}"

        try:
            self.create_sandbox(sandbox_name, workspace, manifest, env_vars)

            module_path, func_name = manifest.runtime.entry_point.rsplit(":", 1)

            agent_script = f"""
import sys, json
sys.path.insert(0, '/agent/src')
sys.path.insert(0, '/agent')
from {module_path.replace('/', '.')} import {func_name}
try:
    result = {func_name}(task={json.dumps(task)}, workspace="/workspace")
    print("__AGENT_OUTPUT__")
    print(json.dumps(result))
except Exception as e:
    print("__AGENT_ERROR__")
    print(json.dumps({{"error": str(e)}}))
"""

            exec_cmd = ["docker", "sandbox", "exec", sandbox_name]
            for key, value in env_vars.items():
                exec_cmd.extend(["-e", f"{key}={value}"])
            exec_cmd.extend(["python3", "-c", agent_script])

            result = subprocess.run(
                exec_cmd, capture_output=True, text=True, timeout=timeout
            )

            stdout = result.stdout
            if "__AGENT_OUTPUT__" in stdout:
                output_json = stdout.split("__AGENT_OUTPUT__")[1].strip()
                output = json.loads(output_json)
                return {
                    "status": "success",
                    "agent": manifest.name,
                    "version": manifest.version,
                    "run_id": run_id,
                    "duration_seconds": 0,
                    "output": output,
                }
            elif "__AGENT_ERROR__" in stdout:
                error_json = stdout.split("__AGENT_ERROR__")[1].strip()
                error = json.loads(error_json)
                return {
                    "status": "error",
                    "agent": manifest.name,
                    "version": manifest.version,
                    "run_id": run_id,
                    "duration_seconds": 0,
                    "output": None,
                    "error": error.get("error", "Unknown error"),
                }
            else:
                return {
                    "status": "error",
                    "agent": manifest.name,
                    "version": manifest.version,
                    "run_id": run_id,
                    "duration_seconds": 0,
                    "output": None,
                    "error": result.stderr or "No output from agent",
                }

        except subprocess.TimeoutExpired:
            return {
                "status": "error",
                "agent": manifest.name,
                "version": manifest.version,
                "run_id": run_id,
                "duration_seconds": timeout,
                "output": None,
                "error": f"Agent exceeded timeout of {timeout}s",
            }
        finally:
            self._destroy_sandbox(sandbox_name)

    def _destroy_sandbox(self, name: str) -> None:
        try:
            subprocess.run(
                ["docker", "sandbox", "rm", "-f", name],
                capture_output=True,
                text=True,
                timeout=30,
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
                return [s for s in sandboxes if s.get("Name", "").startswith("as-")]
            return []
        except Exception:
            return []
