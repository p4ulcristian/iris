"""Output handling - type text using wtype."""

import subprocess


def paste_text(text: str):
    """Type text directly using wtype with trailing space."""
    try:
        subprocess.run(["wtype", text + " "], check=True)
        print(f"Typed: {text}", flush=True)
    except Exception as e:
        print(f"paste_text error: {e}", flush=True)


def send_to_iris(text: str):
    """Send text to master Iris tmux pane."""
    try:
        # Escape special characters for tmux
        escaped = text.replace("'", "'\"'\"'")
        subprocess.run(
            ['tmux', 'send-keys', '-t', 'iris:master.0', escaped, 'Enter'],
            capture_output=True,
            timeout=5
        )
        print(f"Sent to Iris: {text}", flush=True)
    except subprocess.TimeoutExpired:
        print("Failed to send to Iris: timeout", flush=True)
    except Exception as e:
        print(f"Failed to send to Iris: {e}", flush=True)


def send_enter_to_iris():
    """Push Enter to master Iris tmux pane."""
    try:
        subprocess.run(
            ['tmux', 'send-keys', '-t', 'iris:master.0', 'Enter'],
            capture_output=True,
            timeout=5
        )
        print("Sent Enter to Iris", flush=True)
    except subprocess.TimeoutExpired:
        print("Failed to send Enter to Iris: timeout", flush=True)
    except Exception as e:
        print(f"Failed to send Enter to Iris: {e}", flush=True)
