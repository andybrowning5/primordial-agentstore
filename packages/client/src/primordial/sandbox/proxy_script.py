#!/usr/bin/env python3
"""In-sandbox reverse proxy that injects real API keys into outbound requests.

This script runs as root inside an E2B sandbox. It receives its configuration
(routes with real API keys) via stdin as a single JSON line, then starts HTTP
servers on localhost ports. Agent code connects to these local ports; the proxy
forwards requests to the real API over HTTPS with the real key injected.

The agent process (running as "user") cannot read this script, the proxy's
/proc entries, or its environment — Linux user isolation enforced by hidepid=2.

STDLIB ONLY — no third-party dependencies.
"""

import http.client
import http.server
import json
import signal
import ssl
import sys
import threading


class ProxyHandler(http.server.BaseHTTPRequestHandler):
    """Forwards HTTP requests to an HTTPS upstream, injecting the real API key."""

    # Use HTTP/1.1 so httpx (Anthropic SDK) keep-alive works correctly.
    protocol_version = "HTTP/1.1"

    # Suppress default stderr logging
    def log_message(self, format, *args):
        pass

    def _proxy(self):
        # Read request body
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length else None

        # Build headers for upstream, stripping hop-by-hop and auth headers
        skip = {"host", "transfer-encoding", "connection", "proxy-connection",
                "x-api-key", "authorization"}
        headers = {}
        for key, value in self.headers.items():
            if key.lower() not in skip:
                headers[key] = value

        # Set correct Host for upstream
        headers["Host"] = self.server.target_host

        # Inject real API key
        if self.server.auth_style == "x-api-key":
            headers["x-api-key"] = self.server.real_key
        else:
            headers["Authorization"] = f"Bearer {self.server.real_key}"

        # Connect to upstream over HTTPS
        try:
            ctx = ssl.create_default_context()
            conn = http.client.HTTPSConnection(self.server.target_host, context=ctx)
            conn.request(self.command, self.path, body=body, headers=headers)
            resp = conn.getresponse()
        except Exception as e:
            self.send_error(502, f"Upstream error: {e}")
            return

        # Send response status
        self.send_response_only(resp.status)

        # Forward response headers
        for key, value in resp.getheaders():
            lk = key.lower()
            # Skip hop-by-hop headers — we manage connection ourselves
            if lk in ("connection", "keep-alive", "transfer-encoding"):
                continue
            self.send_header(key, value)
        # Close connection after each response for simplicity.
        # LLM API calls are infrequent enough that keep-alive isn't needed.
        self.send_header("Connection", "close")
        self.end_headers()

        # Stream response body in chunks (critical for SSE/streaming)
        try:
            while True:
                chunk = resp.read(8192)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            conn.close()

    # Handle all HTTP methods
    do_GET = _proxy
    do_POST = _proxy
    do_PUT = _proxy
    do_DELETE = _proxy
    do_PATCH = _proxy
    do_HEAD = _proxy
    do_OPTIONS = _proxy


class ThreadedProxyServer(http.server.ThreadingHTTPServer):
    """HTTPServer with route config attached."""

    daemon_threads = True

    def __init__(self, port, target_host, real_key, auth_style, **_):
        self.target_host = target_host
        self.real_key = real_key
        self.auth_style = auth_style
        super().__init__(("127.0.0.1", port), ProxyHandler)


def main():
    # Read config from stdin (single JSON line)
    config_line = sys.stdin.readline().strip()
    if not config_line:
        sys.exit(1)
    config = json.loads(config_line)

    servers = []
    threads = []

    for route in config["routes"]:
        server = ThreadedProxyServer(**route)
        t = threading.Thread(target=server.serve_forever, daemon=True)
        t.start()
        servers.append(server)
        threads.append(t)

    # Signal ready
    ports = [r["port"] for r in config["routes"]]
    sys.stdout.write(json.dumps({"status": "ready", "ports": ports}) + "\n")
    sys.stdout.flush()

    # Wait for termination
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    stop.wait()

    for s in servers:
        s.shutdown()


if __name__ == "__main__":
    main()
