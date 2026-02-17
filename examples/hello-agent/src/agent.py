"""Hello Agent - a simple demo agent for Agent Store."""

from __future__ import annotations

import os
from pathlib import Path


def run(task: str, workspace: str = ".") -> dict:
    """Main entry point called by the Agent Store platform."""
    workspace_path = Path(workspace)

    # List files in workspace
    files = []
    for root, dirs, filenames in os.walk(workspace_path):
        # Skip hidden directories
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for f in filenames:
            if not f.startswith("."):
                rel_path = os.path.relpath(os.path.join(root, f), workspace_path)
                files.append(rel_path)

    return {
        "status": "success",
        "greeting": f"Hello! I received your task: {task}",
        "workspace_summary": {
            "path": str(workspace_path.resolve()),
            "file_count": len(files),
            "files": files[:50],  # Limit to 50 files
        },
    }
