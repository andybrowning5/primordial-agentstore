#!/usr/bin/env python3
"""In-sandbox delegation proxy for agent-to-agent communication.

This script runs as root inside an E2B sandbox. It acts as a thin NDJSON pipe
between the agent process (running as "user") and the host-side delegation
handler. Only safe commands are allowed — anything that could expose API keys
or host configuration is blocked.

STDLIB ONLY — no third-party dependencies.
"""

import json
import sys
import threading

# Commands the agent is allowed to use
_ALLOWED_COMMANDS = {
    "search",       # Semantic search for agents (FastEmbed on host)
    "search_all",   # List all agents by stars
    "run",          # Spawn a sub-agent, get session_id
    "message",      # Send message to sub-agent
    "monitor",      # View last 1000 lines of sub-agent output
    "stop",         # Shutdown a sub-agent
}


def _send_to_host(msg: dict) -> None:
    """Write NDJSON message to stdout (read by host-side handler)."""
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def _send_to_agent(pipe, msg: dict) -> None:
    """Write NDJSON message to the agent process via its stdin pipe."""
    pipe.write(json.dumps(msg) + "\n")
    pipe.flush()


def main():
    """NDJSON relay between agent process and host delegation handler.

    Reads from the agent process on a named pipe, validates commands,
    forwards to host via stdout. Reads host responses from stdin,
    forwards back to agent.

    The proxy communicates with the agent via a Unix domain socket
    bound at /tmp/_primordial_delegate.sock. The agent connects and
    sends NDJSON commands; the proxy relays responses back.
    """
    import os
    import socket

    SOCK_PATH = "/tmp/_primordial_delegate.sock"

    # Clean up stale socket
    if os.path.exists(SOCK_PATH):
        os.unlink(SOCK_PATH)

    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(SOCK_PATH)
    # Allow agent user to connect
    os.chmod(SOCK_PATH, 0o777)
    server.listen(1)

    # Signal ready to host
    _send_to_host({"type": "delegation_ready"})

    # Pending responses keyed by request_id
    pending = {}
    pending_lock = threading.Lock()

    def _host_reader():
        """Read responses from host (stdin) and route to pending requests."""
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue

            req_id = msg.get("request_id")
            if not req_id:
                continue

            with pending_lock:
                if req_id in pending:
                    conn = pending[req_id]
                    try:
                        conn.sendall((json.dumps(msg) + "\n").encode())
                    except (BrokenPipeError, OSError):
                        pass
                    # For streaming commands, keep connection open until
                    # the final response arrives
                    msg_type = msg.get("type", "")
                    is_stream_end = (
                        msg_type not in ("stream_event", "setup_status")
                        or msg.get("done", False)
                    )
                    if is_stream_end:
                        del pending[req_id]

    host_thread = threading.Thread(target=_host_reader, daemon=True)
    host_thread.start()

    # Track request IDs (protected by pending_lock for thread safety)
    req_counter = 0

    while True:
        try:
            conn, _ = server.accept()
        except OSError:
            break

        def _handle_client(client_conn):
            nonlocal req_counter
            buf = b""
            try:
                while True:
                    data = client_conn.recv(65536)
                    if not data:
                        break
                    buf += data
                    while b"\n" in buf:
                        line, buf = buf.split(b"\n", 1)
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            msg = json.loads(line)
                        except json.JSONDecodeError:
                            client_conn.sendall(
                                (json.dumps({"type": "error", "error": "Invalid JSON"}) + "\n").encode()
                            )
                            continue

                        cmd = msg.get("type", "")

                        if cmd not in _ALLOWED_COMMANDS:
                            client_conn.sendall(
                                (json.dumps({
                                    "type": "error",
                                    "error": f"Unknown command '{cmd}'",
                                }) + "\n").encode()
                            )
                            continue

                        # Assign request ID and register for response (atomic)
                        with pending_lock:
                            req_counter += 1
                            req_id = f"req-{req_counter}"
                            msg["request_id"] = req_id
                            pending[req_id] = client_conn

                        # Forward to host
                        _send_to_host(msg)

                        # For streaming commands, wait for done
                        # For non-streaming, the host_reader will clean up
                        if cmd in ("message", "run"):
                            # Block until this request is fulfilled
                            while True:
                                with pending_lock:
                                    if req_id not in pending:
                                        break
                                import time
                                time.sleep(0.05)
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
            finally:
                # Clean up any pending requests for this connection
                with pending_lock:
                    to_remove = [k for k, v in pending.items() if v is client_conn]
                    for k in to_remove:
                        del pending[k]
                try:
                    client_conn.close()
                except OSError:
                    pass

        t = threading.Thread(target=_handle_client, args=(conn,), daemon=True)
        t.start()


if __name__ == "__main__":
    main()
