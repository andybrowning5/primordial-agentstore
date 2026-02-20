"""Hello Agent - a simple demo agent for Agent Store."""

import json
import os
import sys
from pathlib import Path

WORKSPACE = Path("/home/user/workspace")


def send(msg):
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


send({"type": "ready"})

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    msg = json.loads(line)

    if msg["type"] == "shutdown":
        break

    if msg["type"] == "message":
        mid = msg["message_id"]
        content = msg["content"]

        # List files in workspace
        files = []
        for root, dirs, filenames in os.walk(WORKSPACE):
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for f in filenames:
                if not f.startswith("."):
                    files.append(os.path.relpath(os.path.join(root, f), WORKSPACE))

        file_list = "\n".join(f"  - {f}" for f in files[:20])
        summary = f"Found {len(files)} files in workspace"
        if files:
            summary += f":\n{file_list}"
        if len(files) > 20:
            summary += f"\n  ... and {len(files) - 20} more"

        send({
            "type": "response",
            "content": f"Hello! You said: {content}\n\n{summary}",
            "message_id": mid,
            "done": True,
        })
