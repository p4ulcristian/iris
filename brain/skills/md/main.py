"""Markdown viewer - open markdown files in Iris.

Opens markdown files in a rendered markdown view.
"""

import sys
import os

from brain.skills.ws import send_message


def open_markdown(filepath: str) -> bool:
    """Open a markdown file in the markdown viewer.

    Args:
        filepath: Path to markdown file

    Returns:
        True if successful, False otherwise
    """
    # Resolve to absolute path
    if not os.path.isabs(filepath):
        filepath = os.path.abspath(filepath)

    if not os.path.exists(filepath):
        print(f"\033[31mFile not found: {filepath}\033[0m", file=sys.stderr)
        return False

    result = send_message({
        "event": "md:open",
        "filePath": filepath
    })

    if result:
        print(f"\033[32mOpened {os.path.basename(filepath)} in markdown viewer\033[0m")
    else:
        print(f"\033[31mFailed to open {filepath}\033[0m", file=sys.stderr)

    return result


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m brain.skills.md <file>")
        print("Example: python -m brain.skills.md README.md")
        sys.exit(1)

    filepath = sys.argv[1]
    result = open_markdown(filepath)
    sys.exit(0 if result else 1)
