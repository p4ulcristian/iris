"""
Iris Hear - Speech-to-Text Module

A standalone STT server that can be used independently of Iris.

Server API:
    GET  /health     - Health check
    POST /start      - Start recording
    POST /stop       - Stop recording and return transcription
    POST /transcribe - Upload audio file and get transcription

Usage as server:
    python -m brain.hear.server

Usage as client:
    from brain.hear import HearClient

    client = HearClient()
    client.start()      # Start recording
    text = client.stop() # Stop and get transcription
"""

import requests
from typing import Optional

__all__ = ["HearClient", "DEFAULT_URL"]

DEFAULT_URL = "http://127.0.0.1:8766"


class HearClient:
    """Client for the Hear STT server."""

    def __init__(self, base_url: str = DEFAULT_URL, timeout: float = 30.0):
        """Initialize client.

        Args:
            base_url: Server URL (default: http://127.0.0.1:8766)
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

    def start(self) -> bool:
        """Start recording.

        Returns:
            True if recording started successfully
        """
        try:
            resp = requests.post(f"{self.base_url}/start", timeout=self.timeout)
            return resp.status_code == 200
        except Exception:
            return False

    def stop(self) -> Optional[str]:
        """Stop recording and get transcription.

        Returns:
            Transcribed text, or None on error
        """
        try:
            resp = requests.post(f"{self.base_url}/stop", timeout=self.timeout)
            if resp.status_code == 200:
                return resp.json().get("text", "")
            return None
        except Exception:
            return None

    def transcribe_file(self, audio_path: str) -> Optional[str]:
        """Transcribe an audio file.

        Args:
            audio_path: Path to audio file (WAV format)

        Returns:
            Transcribed text, or None on error
        """
        try:
            with open(audio_path, "rb") as f:
                resp = requests.post(
                    f"{self.base_url}/transcribe",
                    files={"audio": f},
                    timeout=self.timeout
                )
            if resp.status_code == 200:
                return resp.json().get("text", "")
            return None
        except Exception:
            return None


# Convenience function
def transcribe(audio_path: str, server_url: str = DEFAULT_URL) -> Optional[str]:
    """Transcribe an audio file using the Hear server.

    Args:
        audio_path: Path to audio file
        server_url: Server URL

    Returns:
        Transcribed text, or None on error
    """
    return HearClient(server_url).transcribe_file(audio_path)
