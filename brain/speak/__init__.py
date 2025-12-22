"""
Iris Speak - Text-to-Speech Module

A standalone TTS server that can be used independently of Iris.

Server API:
    GET  /health  - Health check
    POST /speak   - Speak text (with optional voice)
    POST /stop    - Stop playback
    POST /mute    - Mute TTS (ignore new requests)
    POST /unmute  - Unmute TTS
    GET  /voices  - List available voices

Usage as server:
    python -m brain.speak.server

Usage as client:
    from brain.speak import SpeakClient, say

    # Using client class
    client = SpeakClient()
    client.speak("Hello world")
    client.speak("Bonjour", voice="french")
    client.stop()

    # Using convenience function
    say("Hello world", voice="emma")
"""

import requests
from typing import Optional, List

__all__ = ["SpeakClient", "say", "DEFAULT_URL"]

DEFAULT_URL = "http://127.0.0.1:8765"


class SpeakClient:
    """Client for the Speak TTS server."""

    def __init__(self, base_url: str = DEFAULT_URL, timeout: float = 60.0):
        """Initialize client.

        Args:
            base_url: Server URL (default: http://127.0.0.1:8765)
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

    def speak(
        self,
        text: str,
        voice: Optional[str] = None,
        stream: bool = True
    ) -> Optional[float]:
        """Speak text.

        Args:
            text: Text to speak (supports paralinguistic tags: [sigh], [laugh], etc.)
            voice: Voice name (optional)
            stream: Use streaming mode for lower latency (default True)

        Returns:
            Duration in seconds, or None on error
        """
        payload = {"text": text, "stream": stream}
        if voice:
            payload["voice"] = voice

        try:
            resp = requests.post(
                f"{self.base_url}/speak",
                json=payload,
                timeout=self.timeout
            )
            if resp.status_code == 200:
                return resp.json().get("duration_seconds", 0)
            return None
        except Exception:
            return None

    def stop(self) -> bool:
        """Stop current playback.

        Returns:
            True if successful
        """
        try:
            resp = requests.post(f"{self.base_url}/stop", timeout=self.timeout)
            return resp.status_code == 200
        except Exception:
            return False

    def mute(self) -> bool:
        """Mute TTS - stop playback and ignore new requests.

        Returns:
            True if successful
        """
        try:
            resp = requests.post(f"{self.base_url}/mute", timeout=self.timeout)
            return resp.status_code == 200
        except Exception:
            return False

    def unmute(self) -> bool:
        """Unmute TTS - allow new speak requests.

        Returns:
            True if successful
        """
        try:
            resp = requests.post(f"{self.base_url}/unmute", timeout=self.timeout)
            return resp.status_code == 200
        except Exception:
            return False

    def voices(self) -> List[str]:
        """Get list of available voices.

        Returns:
            List of voice names
        """
        try:
            resp = requests.get(f"{self.base_url}/voices", timeout=self.timeout)
            if resp.status_code == 200:
                return resp.json().get("voices", [])
            return []
        except Exception:
            return []


# Convenience function
def say(
    text: str,
    voice: Optional[str] = None,
    server_url: str = DEFAULT_URL
) -> bool:
    """Speak text using the Speak server.

    Args:
        text: Text to speak
        voice: Voice name (optional)
        server_url: Server URL

    Returns:
        True if successful
    """
    result = SpeakClient(server_url).speak(text, voice=voice)
    return result is not None
