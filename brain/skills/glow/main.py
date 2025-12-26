"""Glow - markdown viewer in Iris v2.

Opens markdown files in a terminal using glow (https://github.com/charmbracelet/glow).
"""

import sys
from pathlib import Path

from brain.skills.ws import spawn_terminal


def open_glow(filepath: str) -> bool:
    """Open a markdown file in a glow terminal.

    Args:
        filepath: Path to markdown file

    Returns:
        True if successful, False otherwise
    """
    path = Path(filepath).expanduser().resolve()

    if not path.exists():
        print(f"\033[31mFile not found: {path}\033[0m")
        return False

    if not path.suffix.lower() in ['.md', '.markdown']:
        print(f"\033[33mWarning: {path.name} may not be a markdown file\033[0m")

    # Spawn terminal with glow in pager mode
    result = spawn_terminal(
        command=f"glow -p '{path}'",
        name=f"Glow: {path.name}",
        color="#89b4fa"  # Blue for glow
    )

    if result:
        print(f"\033[32mOpened {path.name} in glow\033[0m")

    return result


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m brain.skills.glow <file>")
        print("Example: python -m brain.skills.glow README.md")
        sys.exit(1)

    filepath = sys.argv[1]
    result = open_glow(filepath)
    sys.exit(0 if result else 1)
