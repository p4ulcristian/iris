"""Nvim-highlight - open file at specific line in Iris v2.

Opens a file in nvim and jumps to a specific line.
"""

import sys
import shlex
from pathlib import Path

from brain.skills.ws import spawn_terminal


def open_at_line(filepath: str, line: int) -> bool:
    """Open a file in nvim at a specific line.

    Args:
        filepath: Path to file
        line: Line number to jump to

    Returns:
        True if successful, False otherwise
    """
    path = Path(filepath).expanduser().resolve()

    if not path.exists():
        print(f"\033[31mFile not found: {path}\033[0m")
        return False

    # Build nvim command with +line
    quoted_path = shlex.quote(str(path))
    nvim_cmd = f"nvim +{line} {quoted_path}"

    # Spawn terminal with nvim
    result = spawn_terminal(
        command=nvim_cmd,
        name=f"Nvim: {path.name}:{line}",
        color="#a6e3a1"  # Green for nvim
    )

    if result:
        print(f"\033[32mOpened {path.name} at line {line}\033[0m")

    return result


def main():
    if len(sys.argv) < 3:
        print("Usage: python -m brain.skills.nvim-highlight <file> <line>")
        print("Example: python -m brain.skills.nvim-highlight src/main.py 42")
        sys.exit(1)

    filepath = sys.argv[1]
    try:
        line = int(sys.argv[2])
    except ValueError:
        print(f"\033[31mInvalid line number: {sys.argv[2]}\033[0m")
        sys.exit(1)

    result = open_at_line(filepath, line)
    sys.exit(0 if result else 1)
