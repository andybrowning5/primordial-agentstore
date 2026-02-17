"""Hello Agent - a simple demo agent for Agent Store."""

from __future__ import annotations

import os
from pathlib import Path

from agentstore_sdk import Agent


class HelloAgent(Agent):
    """A friendly demo agent that greets users and explores the workspace."""

    def setup(self):
        self.workspace = Path("/home/agent/workspace")

    def handle_message(self, content: str, message_id: str):
        # List files in workspace
        files = []
        for root, dirs, filenames in os.walk(self.workspace):
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for f in filenames:
                if not f.startswith("."):
                    rel_path = os.path.relpath(os.path.join(root, f), self.workspace)
                    files.append(rel_path)

        file_list = "\n".join(f"  - {f}" for f in files[:20])
        summary = f"Found {len(files)} files in workspace"
        if files:
            summary += f":\n{file_list}"
        if len(files) > 20:
            summary += f"\n  ... and {len(files) - 20} more"

        self.send_response(
            f"Hello! You said: {content}\n\n{summary}",
            message_id,
        )

    def teardown(self):
        pass


def create_agent():
    return HelloAgent()
