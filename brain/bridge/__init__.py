# /// script
# requires-python = ">=3.11"
# dependencies = ["websockets"]
# ///
"""
Iris Bridge - WebSocket client for communicating with the Electron app.

Usage:
    from brain.bridge import IrisBridge

    bridge = IrisBridge()
    bridge.emit("god:status", {"uuid": "...", "status": "fulfilled"})
"""

from .client import IrisBridge, emit, emit_sync

__all__ = ["IrisBridge", "emit", "emit_sync"]
