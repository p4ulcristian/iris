#!/usr/bin/env python3
"""cdp.py — tiny Chrome DevTools Protocol helper (stdlib only).

Shared by the browser skills (read-tab.sh, send-to-tab.sh). It speaks just
enough of the WebSocket protocol (RFC6455) over a raw socket to send one
`Runtime.evaluate` and read the matching reply — no third-party libraries.

CLI:
    cdp.py eval  <pattern> <js-expression>
        Find the first page-type tab whose title or URL contains <pattern>
        (case-insensitive substring), evaluate <js-expression> in it, and
        print the returned value (JSON-decoded strings are printed raw).

    cdp.py tabs
        Print every page-type tab as "<title>\t<url>".

Exit status is non-zero on any error (no tab, eval threw, etc.).
"""
import base64
import json
import os
import socket
import struct
import sys
import urllib.request

HOST = os.environ.get("CDP_HOST", "127.0.0.1")
PORT = int(os.environ.get("CDP_PORT", "9222"))


def http_json(path):
    url = f"http://{HOST}:{PORT}{path}"
    with urllib.request.urlopen(url, timeout=5) as r:
        return json.load(r)


def page_tabs():
    return [t for t in http_json("/json") if t.get("type") == "page"]


def find_tab(pattern):
    pat = pattern.lower()
    for t in page_tabs():
        hay = (t.get("title", "") + " " + t.get("url", "")).lower()
        if pat in hay:
            return t
    return None


class WS:
    """Minimal client WebSocket: connect, send text, recv text frames."""

    def __init__(self, ws_url):
        assert ws_url.startswith("ws://")
        rest = ws_url[len("ws://"):]
        hostport, _, path = rest.partition("/")
        host, _, port = hostport.partition(":")
        self.sock = socket.create_connection((host, int(port or 80)), timeout=10)
        key = base64.b64encode(os.urandom(16)).decode()
        handshake = (
            f"GET /{path} HTTP/1.1\r\n"
            f"Host: {hostport}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(handshake.encode())
        self._buf = b""
        # read until end of handshake headers
        while b"\r\n\r\n" not in self._buf:
            self._buf += self.sock.recv(4096)
        self._buf = self._buf.split(b"\r\n\r\n", 1)[1]

    def send(self, text):
        data = text.encode()
        # client frames must be masked
        mask = os.urandom(4)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        header = bytearray([0x81])  # FIN + text opcode
        n = len(data)
        if n < 126:
            header.append(0x80 | n)
        elif n < 65536:
            header.append(0x80 | 126)
            header += struct.pack(">H", n)
        else:
            header.append(0x80 | 127)
            header += struct.pack(">Q", n)
        self.sock.sendall(bytes(header) + mask + masked)

    def _read(self, n):
        while len(self._buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise ConnectionError("socket closed")
            self._buf += chunk
        out, self._buf = self._buf[:n], self._buf[n:]
        return out

    def recv(self):
        b0, b1 = self._read(2)
        length = b1 & 0x7F
        if length == 126:
            length = struct.unpack(">H", self._read(2))[0]
        elif length == 127:
            length = struct.unpack(">Q", self._read(8))[0]
        payload = self._read(length)  # server->client frames are never masked
        return payload.decode("utf-8", "replace")

    def close(self):
        try:
            self.sock.close()
        except OSError:
            pass


def evaluate(ws_url, expression, await_promise=True, timeout=20):
    ws = WS(ws_url)
    try:
        msg_id = 1
        ws.send(json.dumps({
            "id": msg_id,
            "method": "Runtime.evaluate",
            "params": {
                "expression": expression,
                "returnByValue": True,
                "awaitPromise": await_promise,
                "userGesture": True,
            },
        }))
        self_deadline = timeout
        while self_deadline > 0:
            ws.sock.settimeout(self_deadline)
            raw = ws.recv()
            data = json.loads(raw)
            if data.get("id") != msg_id:
                continue  # skip async protocol events
            if "error" in data:
                raise RuntimeError(data["error"].get("message", "eval error"))
            result = data["result"]
            if result.get("exceptionDetails"):
                exc = result["exceptionDetails"]
                raise RuntimeError(exc.get("exception", {}).get("description")
                                   or exc.get("text", "JS exception"))
            return result.get("result", {}).get("value")
    finally:
        ws.close()


def main(argv):
    if not argv:
        print(__doc__, file=sys.stderr)
        return 2
    cmd = argv[0]
    if cmd == "tabs":
        for t in page_tabs():
            print(f"{t.get('title','')}\t{t.get('url','')}")
        return 0
    if cmd == "eval":
        if len(argv) < 3:
            print("usage: cdp.py eval <pattern> <js>", file=sys.stderr)
            return 2
        pattern, js = argv[1], argv[2]
        tab = find_tab(pattern)
        if not tab:
            print(f"no page tab matching: {pattern}", file=sys.stderr)
            return 1
        ws_url = tab.get("webSocketDebuggerUrl")
        if not ws_url:
            print("tab has no webSocketDebuggerUrl", file=sys.stderr)
            return 1
        value = evaluate(ws_url, js)
        if isinstance(value, (dict, list)):
            print(json.dumps(value, ensure_ascii=False, indent=2))
        elif value is not None:
            print(value)
        return 0
    print(f"unknown command: {cmd}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
