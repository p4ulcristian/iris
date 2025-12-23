"""Chrome - browser with remote debugging for MCP.

Opens Chrome with remote debugging enabled so Claude can connect via MCP.
"""
from __future__ import annotations

import sys
import subprocess
import time
from pathlib import Path

from brain.cli import tmux, config

# Chrome paths to try
CHROME_PATHS = [
    "/opt/google/chrome/chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
]

DEBUG_PORT = 9222
USER_DATA_DIR = "/tmp/chrome-mcp-debug"


def find_chrome() -> str | None:
    """Find Chrome executable."""
    for path in CHROME_PATHS:
        if Path(path).exists():
            return path
    return None


def open_chrome(url: str | None = None) -> str | None:
    """Open Chrome with remote debugging enabled.

    Args:
        url: Optional URL to open (default: about:blank)

    Returns:
        Pane ID if successful, None otherwise
    """
    chrome_path = find_chrome()
    if not chrome_path:
        print("\033[31mChrome not found. Tried:\033[0m")
        for p in CHROME_PATHS:
            print(f"  - {p}")
        return None

    if not tmux.session_exists():
        print("\033[31mIris session not running\033[0m")
        return None

    # Build Chrome command
    target_url = url or "about:blank"
    chrome_cmd = (
        f"{chrome_path} "
        f"--remote-debugging-port={DEBUG_PORT} "
        f"--user-data-dir={USER_DATA_DIR} "
        f'"{target_url}"'
    )

    # Create pane with Chrome
    result = tmux.run(
        "split-window", "-t", config.SESSION, "-d", "-h",
        "-P", "-F", "#{pane_id}",
        chrome_cmd
    )

    if result.returncode != 0:
        print("\033[31mFailed to create Chrome pane\033[0m")
        return None

    pane_id = result.stdout.strip()

    # Set title
    tmux.set_pane_title(pane_id, "Chrome")

    # Apply layout
    tmux.apply_layout()

    # Wait a moment for Chrome to start
    time.sleep(2)

    # Check if debug port is accessible
    try:
        import urllib.request
        with urllib.request.urlopen(f"http://localhost:{DEBUG_PORT}/json/version", timeout=5) as resp:
            if resp.status == 200:
                print(f"\033[32mChrome started with remote debugging on port {DEBUG_PORT}\033[0m")
                print(f"\033[33mMCP can now connect to Chrome DevTools\033[0m")
            else:
                print(f"\033[33mChrome started but debug port may not be ready\033[0m")
    except Exception:
        print(f"\033[33mChrome started - debug port {DEBUG_PORT} may take a moment to be ready\033[0m")

    return pane_id


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else None

    if url in ["-h", "--help"]:
        print("Usage: python -m brain.skills.chrome [url]")
        print("")
        print("Opens Chrome with remote debugging enabled for MCP connection.")
        print("")
        print("Options:")
        print("  url    Optional URL to open (default: about:blank)")
        print("")
        print("Examples:")
        print("  python -m brain.skills.chrome")
        print("  python -m brain.skills.chrome https://localhost/customize")
        print("")
        print(f"Debug port: {DEBUG_PORT}")
        print(f"User data dir: {USER_DATA_DIR}")
        sys.exit(0)

    result = open_chrome(url)
    sys.exit(0 if result else 1)
