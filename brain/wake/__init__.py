"""
Iris Wake - Attention Coordinator Module

Listens for push-to-talk triggers and coordinates STT/TTS servers.

Platform Support:
    - Linux: Full support via evdev (CapsLock as PTT key)
    - macOS: Stub implementation (no PTT, but module loads)
    - Windows: Not supported yet

Usage:
    from brain.wake import PTTListener, is_supported

    if is_supported():
        listener = PTTListener(
            on_press=lambda mode: print(f"Started recording ({mode})"),
            on_release=lambda mode: print(f"Stopped recording ({mode})"),
            on_tap=lambda: print("Quick tap - skip TTS"),
        )
        listener.start()

Server mode:
    python -m brain.wake.listener
"""

import platform
from typing import Callable, Optional

__all__ = ["PTTListener", "is_supported", "PLATFORM"]

PLATFORM = platform.system()


def is_supported() -> bool:
    """Check if PTT is supported on this platform."""
    return PLATFORM == "Linux"


if PLATFORM == "Linux":
    # Import real implementation
    try:
        from .ptt import PTTListener
    except ImportError:
        # evdev not installed
        PTTListener = None
else:
    # Stub implementation for non-Linux platforms
    class PTTListener:
        """Stub PTT listener for non-Linux platforms.

        Does nothing but allows code to import without errors.
        """

        def __init__(
            self,
            on_press: Optional[Callable] = None,
            on_release: Optional[Callable] = None,
            on_enter: Optional[Callable] = None,
            on_tap: Optional[Callable] = None,
            key: int = 58,  # KEY_CAPSLOCK
        ):
            self.on_press = on_press
            self.on_release = on_release
            self.on_enter = on_enter
            self.on_tap = on_tap
            self.key = key
            self._running = False

        def start(self):
            """Start listening (no-op on non-Linux)."""
            print(f"[wake] PTT not supported on {PLATFORM} - running in stub mode")
            self._running = True

        def stop(self):
            """Stop listening."""
            self._running = False

        @property
        def running(self) -> bool:
            return self._running
