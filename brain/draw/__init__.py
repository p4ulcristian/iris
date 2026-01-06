"""
Draw Service Client

Client interface for the StarVector SVG generation service.
"""

import requests
from typing import Optional

__all__ = ["DrawClient", "DEFAULT_URL"]

DEFAULT_URL = "http://127.0.0.1:8768"


class DrawClient:
    """Client for the Draw SVG generation service."""

    def __init__(self, base_url: str = DEFAULT_URL, timeout: float = 120.0):
        """Initialize the client.

        Args:
            base_url: Service URL
            timeout: Request timeout in seconds (default 120s for generation)
        """
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def health(self) -> bool:
        """Check if service is ready.

        Returns:
            True if service is ready, False otherwise
        """
        try:
            resp = requests.get(f"{self.base_url}/health", timeout=5.0)
            return resp.json().get("ready", False)
        except Exception:
            return False

    def text2svg(
        self,
        prompt: str,
        mono: bool = False,
        color: str = "#ffffff",
        max_length: int = 4000
    ) -> Optional[str]:
        """Generate SVG from text prompt.

        Args:
            prompt: Text description of the icon
            mono: Convert to monochrome
            color: Monochrome color (hex)
            max_length: Max token length

        Returns:
            SVG string or None on error
        """
        try:
            resp = requests.post(
                f"{self.base_url}/text2svg",
                json={
                    "prompt": prompt,
                    "mono": mono,
                    "color": color,
                    "max_length": max_length
                },
                timeout=self.timeout
            )
            if resp.status_code == 200:
                return resp.json().get("svg")
            return None
        except Exception:
            return None

    def image2svg(
        self,
        image_path: str,
        mono: bool = False,
        color: str = "#ffffff",
        max_length: int = 4000
    ) -> Optional[str]:
        """Generate SVG from image file.

        Args:
            image_path: Path to image file
            mono: Convert to monochrome
            color: Monochrome color (hex)
            max_length: Max token length

        Returns:
            SVG string or None on error
        """
        try:
            with open(image_path, "rb") as f:
                resp = requests.post(
                    f"{self.base_url}/image2svg",
                    files={"image": f},
                    data={
                        "mono": str(mono).lower(),
                        "color": color,
                        "max_length": str(max_length)
                    },
                    timeout=self.timeout
                )
            if resp.status_code == 200:
                return resp.json().get("svg")
            return None
        except Exception:
            return None


# Convenience functions
def generate(prompt: str, **kwargs) -> Optional[str]:
    """Generate SVG from prompt using default client."""
    return DrawClient().text2svg(prompt, **kwargs)


def vectorize(image_path: str, **kwargs) -> Optional[str]:
    """Convert image to SVG using default client."""
    return DrawClient().image2svg(image_path, **kwargs)
