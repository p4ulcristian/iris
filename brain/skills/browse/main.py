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
    # Add protocol if missing
    if not url.startswith('http://') and not url.startswith('https://'):
        url = 'https://' + url

    result = send_message({
        "event": "browser:navigate",
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
