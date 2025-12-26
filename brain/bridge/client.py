# /// script
# requires-python = ">=3.11"
# dependencies = ["websockets"]
# ///
"""
WebSocket client for communicating with Iris Electron app.
"""

import asyncio
import json
from typing import Any


class IrisBridge:
    """WebSocket client for Iris app communication."""

    def __init__(self, host: str = "localhost", port: int = 9999):
        self.uri = f"ws://{host}:{port}"
        self._ws = None

    async def connect(self):
        """Connect to the Iris app WebSocket server."""
        import websockets
        self._ws = await websockets.connect(self.uri)
        return self

    async def disconnect(self):
        """Disconnect from the Iris app."""
        if self._ws:
            await self._ws.close()
            self._ws = None

    async def emit(self, event: str, data: dict[str, Any] | None = None):
        """Send an event to the Iris app."""
        import websockets

        payload = {"event": event, **(data or {})}
        message = json.dumps(payload)

        try:
            async with websockets.connect(self.uri) as ws:
                await ws.send(message)
        except Exception as e:
            print(f"Bridge error: {e}")

    def emit_sync(self, event: str, data: dict[str, Any] | None = None):
        """Synchronous wrapper for emit."""
        try:
            asyncio.run(self.emit(event, data))
        except RuntimeError:
            # Already in an event loop
            loop = asyncio.get_event_loop()
            loop.run_until_complete(self.emit(event, data))


# Convenience functions
_bridge = None


def _get_bridge() -> IrisBridge:
    global _bridge
    if _bridge is None:
        _bridge = IrisBridge()
    return _bridge


async def emit(event: str, data: dict[str, Any] | None = None):
    """Emit an event to the Iris app."""
    await _get_bridge().emit(event, data)


def emit_sync(event: str, data: dict[str, Any] | None = None):
    """Synchronously emit an event to the Iris app."""
    _get_bridge().emit_sync(event, data)


# CLI for testing
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python -m brain.bridge.client <event> [json_data]")
        print("Example: python -m brain.bridge.client god:status '{\"uuid\": \"zeus-123\", \"status\": \"done\"}'")
        sys.exit(1)

    event = sys.argv[1]
    data = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}

    print(f"Sending: {event} {data}")
    emit_sync(event, data)
    print("Sent!")
