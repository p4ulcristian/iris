"""Browse - open URLs in the Iris browser.

Opens URLs in the built-in Iris browser view.
"""

import sys

from brain.skills.ws import send_message


def open_browser(url: str) -> bool:
    """Open a URL in the Iris browser.

    Args:
        url: URL to open (protocol will be added if missing)

    Returns:
        True if successful, False otherwise
    """
    # Handle local file paths
    if url.startswith('/'):
        url = 'file://' + url
    # Add https if no protocol specified
    elif not url.startswith(('http://', 'https://', 'file://')):
        url = 'https://' + url

    # Spawn a browser entity with the URL
    result = send_message({
        "event": "entity:spawn",
        "type": "browser",
        "url": url
    })

    if result:
        print(f"\033[32mOpening {url} in browser\033[0m")
    else:
        print(f"\033[31mFailed to open {url}\033[0m", file=sys.stderr)

    return result


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m brain.skills.browse <url>")
        print("Example: python -m brain.skills.browse github.com")
        print("         python -m brain.skills.browse https://example.com")
        sys.exit(1)

    url = sys.argv[1]
    result = open_browser(url)
    sys.exit(0 if result else 1)
