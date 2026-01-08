"""Output handling - type text using wtype and send to Iris via WebSocket."""

import subprocess
import json


IRIS_WS_URL = "ws://127.0.0.1:9999"


def paste_text(text: str):
    """Type text directly using wtype with trailing space."""
    try:
        subprocess.run(["wtype", text + " "], check=True)
        print(f"Typed: {text}", flush=True)
    except Exception as e:
        print(f"paste_text error: {e}", flush=True)


def send_to_iris(text: str):
    """Send text to Iris app via WebSocket."""
    try:
        # Use websocat to send a message to Iris
        message = json.dumps({"event": "voice:input", "text": text})
        result = subprocess.run(
            ["websocat", "-1", IRIS_WS_URL],
            input=message,
            capture_output=True,
            text=True,
            timeout=5
        )
        print(f"Sent to Iris: {text}", flush=True)
    except Exception as e:
        print(f"send_to_iris error: {e}", flush=True)
