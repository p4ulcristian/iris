"""Chrome - browser with remote debugging for MCP.

Usage:
    python -m brain.skills.chrome
    python -m brain.skills.chrome https://localhost/customize
"""

from brain.skills.chrome.main import open_chrome

__all__ = ["open_chrome"]
