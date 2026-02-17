#!/usr/bin/env python3
"""NDJSON bridge between AgentStore protocol and OpenClaw CLI.

Translates AgentStore's stdin/stdout NDJSON message protocol into
calls to `openclaw agent --local --message "..." --json`.
"""

import json
import subprocess
import sys


def send(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def handle_message(content: str, message_id: str) -> None:
    """Run an OpenClaw agent turn and relay the response."""
    send({"type": "activity", "tool": "openclaw", "description": "Thinking...", "message_id": message_id})

    try:
        result = subprocess.run(
            ["openclaw", "agent", "--local", "--message", content, "--json"],
            capture_output=True,
            text=True,
            timeout=280,
        )

        if result.returncode != 0:
            error = result.stderr.strip() or "OpenClaw returned an error"
            send({"type": "error", "error": error, "message_id": message_id})
            return

        # Parse OpenClaw's JSON output and extract the response text
        output = result.stdout.strip()
        try:
            data = json.loads(output)
            # OpenClaw JSON output varies; extract the text response
            if isinstance(data, dict):
                response_text = (
                    data.get("response")
                    or data.get("content")
                    or data.get("text")
                    or data.get("message")
                    or json.dumps(data, indent=2)
                )
            else:
                response_text = str(data)
        except json.JSONDecodeError:
            # If not valid JSON, use raw output
            response_text = output

        send({"type": "response", "content": response_text, "message_id": message_id, "done": True})

    except subprocess.TimeoutExpired:
        send({"type": "error", "error": "OpenClaw timed out", "message_id": message_id})
    except FileNotFoundError:
        send({"type": "error", "error": "openclaw command not found — is it installed?", "message_id": message_id})


def main() -> None:
    send({"type": "ready"})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue

        if msg.get("type") == "message":
            handle_message(msg["content"], msg.get("message_id", "unknown"))
        elif msg.get("type") == "shutdown":
            break


if __name__ == "__main__":
    main()
