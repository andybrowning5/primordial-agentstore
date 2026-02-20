"""Steve Agent Store adapter.

Wraps Steve's LangGraph-based job hunting agent in the Ooze Protocol
for use on the Agent Store platform.
"""

import json
import sys
from typing import Any


def send(msg):
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def extract_response(result: dict[str, Any]) -> str:
    """Extract assistant text from a LangGraph invoke result."""
    if "messages" not in result:
        return ""
    for msg in reversed(result["messages"]):
        if getattr(msg, "type", None) == "ai" and getattr(msg, "content", None):
            content = msg.content
            if isinstance(content, list):
                parts = []
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        parts.append(block.get("text", ""))
                    elif isinstance(block, str):
                        parts.append(block)
                content = "\n".join(parts)
            if content:
                return content
    return ""


# Initialize Steve's LangGraph agent
try:
    from steve.agent import create_steve_agent
except ImportError:
    sys.path.insert(0, "/agent/steve_src")
    from src.agent import create_steve_agent

agent = create_steve_agent()
config = {"configurable": {"thread_id": "agentstore-session"}}

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

        try:
            final_response = ""

            if hasattr(agent, "stream"):
                for event in agent.stream(
                    {"messages": [{"role": "user", "content": content}]},
                    config=config,
                    stream_mode="values",
                ):
                    if isinstance(event, dict) and "messages" in event:
                        for m in reversed(event["messages"]):
                            if (
                                getattr(m, "type", None) == "ai"
                                and hasattr(m, "tool_calls")
                                and m.tool_calls
                            ):
                                for tc in m.tool_calls:
                                    tool_name = tc.get("name", "unknown")
                                    send({
                                        "type": "activity",
                                        "tool": tool_name,
                                        "description": f"Using {tool_name}",
                                        "message_id": mid,
                                    })

                            if getattr(m, "type", None) == "ai":
                                mc = getattr(m, "content", "")
                                if isinstance(mc, str) and mc.strip():
                                    final_response = mc
                                    break
                                elif isinstance(mc, list):
                                    for block in mc:
                                        if isinstance(block, dict) and block.get("type") == "text":
                                            final_response = block.get("text", "")
                                            break
                                    if final_response:
                                        break
            else:
                result = agent.invoke(
                    {"messages": [{"role": "user", "content": content}]},
                    config=config,
                )
                final_response = extract_response(result)

            send({
                "type": "response",
                "content": final_response or "I processed your message but didn't generate a text response.",
                "message_id": mid,
                "done": True,
            })

        except Exception as exc:
            send({"type": "error", "error": str(exc), "message_id": mid})
