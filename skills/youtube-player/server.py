#!/usr/bin/env python3
"""Minimal HTTP server for the iris YouTube player.

Serves index.html and exposes a tiny REST API that iris calls to drive the
browser-loaded player:

    GET /play?v=VIDEO_ID   load and play a video
    GET /pause             pause playback
    GET /resume            resume playback
    GET /stop              stop playback
    GET /command?since=N   (used by the page) latest command + version
    GET /health            liveness check

The page can't be poked directly, so commands are stored here with a
monotonically increasing version. The page polls /command and applies any
command newer than the one it last saw.
"""

import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT = int(os.environ.get("IRIS_YT_PORT", "8745"))
HERE = os.path.dirname(os.path.abspath(__file__))

# Shared command state, guarded by a lock.
_lock = threading.Lock()
_state = {"version": 0, "command": {"action": "idle"}}


def set_command(command):
    with _lock:
        _state["version"] += 1
        _state["command"] = command
        return _state["version"]


def get_state():
    with _lock:
        return {"version": _state["version"], "command": _state["command"]}


class Handler(BaseHTTPRequestHandler):
    # quieter logging — one line per request to stderr
    def log_message(self, fmt, *args):
        sys.stderr.write("yt-server: %s\n" % (fmt % args))

    def _send_json(self, obj, status=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path, content_type):
        try:
            with open(path, "rb") as f:
                body = f.read()
        except OSError:
            self.send_error(404, "not found")
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)

        if path in ("/", "/index.html"):
            self._send_file(os.path.join(HERE, "index.html"), "text/html; charset=utf-8")
            return

        if path == "/health":
            self._send_json({"ok": True})
            return

        if path == "/command":
            self._send_json(get_state())
            return

        if path == "/play":
            v = (params.get("v") or [""])[0].strip()
            if not v:
                self._send_json({"ok": False, "error": "missing v"}, status=400)
                return
            version = set_command({"action": "play", "v": v})
            self._send_json({"ok": True, "action": "play", "v": v, "version": version})
            return

        if path == "/pause":
            version = set_command({"action": "pause"})
            self._send_json({"ok": True, "action": "pause", "version": version})
            return

        if path == "/resume":
            version = set_command({"action": "resume"})
            self._send_json({"ok": True, "action": "resume", "version": version})
            return

        if path == "/stop":
            version = set_command({"action": "stop"})
            self._send_json({"ok": True, "action": "stop", "version": version})
            return

        self.send_error(404, "not found")


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    sys.stderr.write("yt-server: listening on http://127.0.0.1:%d\n" % PORT)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
