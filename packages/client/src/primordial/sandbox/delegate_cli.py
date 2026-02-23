#!/usr/bin/env python3
"""CLI for agent delegation via the Primordial NDJSON socket protocol.

Installed at /usr/local/bin/delegate inside sandboxes. Any agent can shell
out to this tool regardless of language or framework.

STDLIB ONLY — no third-party dependencies.
"""

import json
import socket
import sys

SOCK_PATH = "/tmp/_primordial_delegate.sock"

USAGE = """\
Usage: delegate <command> [args...]

Commands:
  search <query>              Search for agents by capability
  search-all                  List all available agents
  run <agent_url>             Spawn a sub-agent, prints session_id
  message <session_id> <msg>  Send message to sub-agent, prints response
  monitor <session_id>        View sub-agent output history
  stop <session_id>           Shut down a sub-agent

stdout = parseable output (JSON or text)
stderr = progress/status events"""


def connect():
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.connect(SOCK_PATH)
    return sock


def send(sock, obj):
    sock.sendall((json.dumps(obj) + "\n").encode())


def read_line(sock, buf=b""):
    while b"\n" not in buf:
        chunk = sock.recv(8192)
        if not chunk:
            raise ConnectionError("Socket closed")
        buf += chunk
    line, buf = buf.split(b"\n", 1)
    return json.loads(line), buf


def emit_activity(tool, description):
    """Emit a Primordial Protocol activity event to stdout.

    The calling process is expected to intercept these JSON lines and
    forward them to the agent's real stdout for TUI display.
    """
    sys.stdout.write(json.dumps({
        "type": "activity",
        "tool": f"sub:{tool}",
        "description": description,
    }) + "\n")
    sys.stdout.flush()


def die(msg):
    print(f"Error: {msg}", file=sys.stderr)
    sys.exit(1)


def cmd_search(args):
    if not args:
        die("Usage: delegate search <query>")
    sock = connect()
    send(sock, {"type": "search", "query": " ".join(args)})
    result, _ = read_line(sock)
    sock.close()
    if result.get("type") == "error":
        die(result.get("error", "unknown error"))
    print(json.dumps(result.get("agents", []), indent=2))


def cmd_search_all(args):
    sock = connect()
    send(sock, {"type": "search_all"})
    result, _ = read_line(sock)
    sock.close()
    if result.get("type") == "error":
        die(result.get("error", "unknown error"))
    print(json.dumps(result.get("agents", []), indent=2))


def cmd_run(args):
    if not args:
        die("Usage: delegate run <agent_url>")
    sock = connect()
    send(sock, {"type": "run", "agent_url": args[0]})
    buf = b""
    while True:
        msg, buf = read_line(sock, buf)
        if msg.get("type") == "setup_status":
            emit_activity("setup", msg.get("status", ""))
        elif msg.get("type") == "session":
            print(msg["session_id"])
            break
        elif msg.get("type") == "error":
            die(msg.get("error", "unknown error"))
        else:
            break
    sock.close()


def cmd_message(args):
    if len(args) < 2:
        die("Usage: delegate message <session_id> <message>")
    session_id = args[0]
    content = " ".join(args[1:])
    sock = connect()
    send(sock, {"type": "message", "session_id": session_id, "content": content})
    buf = b""
    while True:
        msg, buf = read_line(sock, buf)
        if msg.get("type") == "error":
            die(msg.get("error", "unknown error"))
        if msg.get("type") != "stream_event":
            continue
        event = msg.get("event", {})
        if event.get("type") == "activity":
            tool = event.get("tool", "")
            desc = event.get("description", "")
            emit_activity(tool, desc)
        elif event.get("type") == "response" and event.get("done"):
            content = event.get("content", "")
            preview = content.replace("\n", " ")[:150].strip()
            if len(content) > 150:
                preview += "..."
            emit_activity("response", preview)
            print(content)
            break
        elif event.get("type") == "error":
            die(event.get("error", "unknown error"))
        if msg.get("done"):
            break
    sock.close()


def cmd_monitor(args):
    if not args:
        die("Usage: delegate monitor <session_id>")
    sock = connect()
    send(sock, {"type": "monitor", "session_id": args[0]})
    result, _ = read_line(sock)
    sock.close()
    if result.get("type") == "error":
        die(result.get("error", "unknown error"))
    for line in result.get("lines", []):
        print(line)


def cmd_stop(args):
    if not args:
        die("Usage: delegate stop <session_id>")
    sock = connect()
    send(sock, {"type": "stop", "session_id": args[0]})
    result, _ = read_line(sock)
    sock.close()
    if result.get("type") == "error":
        die(result.get("error", "unknown error"))
    print(f"Stopped {args[0]}")


COMMANDS = {
    "search": cmd_search,
    "search-all": cmd_search_all,
    "run": cmd_run,
    "message": cmd_message,
    "monitor": cmd_monitor,
    "stop": cmd_stop,
}


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help", "help"):
        print(USAGE)
        sys.exit(0)

    cmd = sys.argv[1]
    if cmd not in COMMANDS:
        die(f"Unknown command: {cmd}\n\n{USAGE}")

    try:
        COMMANDS[cmd](sys.argv[2:])
    except ConnectionError as e:
        die(f"Cannot connect to delegation socket: {e}")
    except Exception as e:
        die(str(e))


if __name__ == "__main__":
    main()
