"""Network policy configuration for Docker AI Sandboxes."""

from __future__ import annotations

import json
import subprocess
from typing import Optional


def configure_network_policy(
    sandbox_name: str,
    allowed_domains: list[str],
    block_private: bool = True,
) -> None:
    """Configure network egress policy for a sandbox."""
    cmd = [
        "docker", "sandbox", "network", "proxy", sandbox_name,
        "--policy", "deny",
    ]
    for domain in allowed_domains:
        cmd.extend(["--allow-host", domain])

    if block_private:
        for cidr in ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8"]:
            cmd.extend(["--block-cidr", cidr])

    subprocess.run(cmd, capture_output=True, text=True, timeout=30, check=True)


def get_network_policy(sandbox_name: str) -> Optional[dict]:
    try:
        result = subprocess.run(
            ["docker", "sandbox", "network", "proxy", sandbox_name, "--status"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            return json.loads(result.stdout)
    except Exception:
        pass
    return None
