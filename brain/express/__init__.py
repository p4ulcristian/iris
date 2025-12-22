"""
Iris Express - Visual UI Module

A visual overlay that shows the current state of the voice assistant.
Uses GTK4 with layer-shell for a floating bubble overlay.

Platform Support:
    - Linux (Wayland): Full support with GTK4 layer-shell
    - Linux (X11): Basic GTK4 window
    - macOS/Windows: Server runs but no UI (headless mode)

Server API:
    GET  /health - Health check
    POST /state  - Update visual state

Valid states:
    - ready: Idle, waiting for input
    - listening: Recording audio
    - speaking: Playing TTS
    - loading: Processing

Usage as server:
    python -m brain.express.server

Usage as client:
    from brain.express import ExpressClient

    client = ExpressClient()
    client.set_state("listening")
    client.set_state("ready")
"""

import requests
from typing import Optional, Literal

__all__ = ["ExpressClient", "set_state", "DEFAULT_URL", "State"]

DEFAULT_URL = "http://127.0.0.1:8767"

# Valid states
State = Literal["ready", "listening", "speaking", "loading"]


class ExpressClient:
    """Client for the Express visual UI server."""

    def __init__(self, base_url: str = DEFAULT_URL, timeout: float = 5.0):
        """Initialize client.

        Args:
            base_url: Server URL (default: http://127.0.0.1:8767)
            timeout: Request timeout in seconds
        """
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def health(self) -> bool:
        """Check if server is ready."""
        try:
            resp = requests.get(f"{self.base_url}/health", timeout=self.timeout)
            return resp.json().get("ready", False)
        except Exception:
            return False

    def set_state(self, state: State) -> bool:
        """Set the visual state.

        Args:
            state: One of "ready", "listening", "speaking", "loading"

        Returns:
            True if successful
        """
        try:
            resp = requests.post(
                f"{self.base_url}/state",
                json={"state": state},
                timeout=self.timeout
            )
            return resp.status_code == 200
        except Exception:
            return False

    def listening(self) -> bool:
        """Set state to 'listening'."""
        return self.set_state("listening")

    def ready(self) -> bool:
        """Set state to 'ready'."""
        return self.set_state("ready")

    def speaking(self) -> bool:
        """Set state to 'speaking'."""
        return self.set_state("speaking")

    def loading(self) -> bool:
        """Set state to 'loading'."""
        return self.set_state("loading")


# Convenience function
def set_state(state: State, server_url: str = DEFAULT_URL) -> bool:
    """Set the visual state.

    Args:
        state: One of "ready", "listening", "speaking", "loading"
        server_url: Server URL

    Returns:
        True if successful
    """
    return ExpressClient(server_url).set_state(state)
