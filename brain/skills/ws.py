"""WebSocket client for Iris v2 Electron app."""

import os
import sys
import json
import socket
import struct
import base64


def send_message(message: dict, host: str = "127.0.0.1", port: int = 9999) -> bool:
    """Send a WebSocket message to the Iris server.

    Uses raw socket with WebSocket handshake for simplicity (no dependencies).

    Args:
        message: Dict to send as JSON
        host: WebSocket host
        port: WebSocket port

    Returns:
        True if successful, False otherwise
    """
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(2.0)
        sock.connect((host, port))

        # WebSocket handshake
        key = base64.b64encode(os.urandom(16)).decode()
        handshake = (
            f"GET / HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n"
            f"\r\n"
        )
        sock.send(handshake.encode())

        # Read response (we don't validate, just consume it)
        response = b""
        while b"\r\n\r\n" not in response:
            chunk = sock.recv(1024)
            if not chunk:
                break
            response += chunk

        # Send WebSocket frame
        payload = json.dumps(message).encode()
        frame = bytearray()
        frame.append(0x81)  # Text frame, FIN bit set

        length = len(payload)
        if length <= 125:
            frame.append(0x80 | length)  # Masked
        elif length <= 65535:
            frame.append(0x80 | 126)
            frame.extend(struct.pack(">H", length))
        else:
            frame.append(0x80 | 127)
            frame.extend(struct.pack(">Q", length))

        # Masking key and masked payload
        mask = os.urandom(4)
        frame.extend(mask)
        for i, byte in enumerate(payload):
            frame.append(byte ^ mask[i % 4])

        sock.send(bytes(frame))
        sock.close()
        return True

    except Exception as e:
        print(f"WebSocket error: {e}", file=sys.stderr)
        return False


def spawn_terminal(command: str = None, name: str = None, color: str = None, cwd: str = None) -> bool:
    """Spawn a terminal in the Iris app.

    Args:
        command: Command to run (default: bash)
        name: Terminal name/title
        color: Hex color for the terminal border
        cwd: Working directory

    Returns:
        True if successful, False otherwise
    """
    msg = {"event": "terminal:spawn"}
    if command:
        msg["command"] = command
    if name:
        msg["name"] = name
    if color:
        msg["color"] = color
    if cwd:
        msg["cwd"] = cwd

    return send_message(msg)


def spawn_god(name: str, task: str = "") -> bool:
    """Spawn a god in Iris v2.

    Args:
        name: God name (e.g., 'hermes', 'athena')
        task: Optional task description

    Returns:
        True if successful, False otherwise
    """
    return send_message({
        "event": "god:spawn",
        "name": name.capitalize(),
        "task": task
    })


def update_status(status: str) -> bool:
    """Update the current god's status.

    Args:
        status: Status text to display

    Returns:
        True if successful, False otherwise
    """
    name = os.environ.get("GOD_NAME")
    if not name:
        print("\033[31mNot running as a god (GOD_NAME not set)\033[0m", file=sys.stderr)
        return False

    return send_message({
        "event": "god:status",
        "godName": name,
        "status": status
    })
