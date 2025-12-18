"""Glow - markdown viewer pane.

Opens markdown files in a tmux pane using glow (https://github.com/charmbracelet/glow).
"""

import sys
from pathlib import Path

from brain.cli import tmux, config


def open_glow(filepath: str) -> str | None:
    """Open a markdown file in a new glow pane.

    Args:
        filepath: Path to markdown file (absolute or relative to IRIS_DIR)

    Returns:
        Pane ID if successful, None otherwise
    """
    path = Path(filepath)
    if not path.is_absolute():
        path = Path(config.IRIS_DIR) / filepath

    if not path.exists():
        print(f"\033[31mFile not found: {path}\033[0m")
        return None

    if not tmux.session_exists():
        print("\033[31mIris session not running\033[0m")
        return None

    # Create pane with glow in pager mode
    result = tmux.run(
        "split-window", "-t", config.SESSION, "-d", "-h",
        "-P", "-F", "#{pane_id}",
        f"glow -p {path}"
    )

    if result.returncode != 0:
        print("\033[31mFailed to create glow pane\033[0m")
        return None

    pane_id = result.stdout.strip()

    # Set title - just filename
    tmux.set_pane_title(pane_id, path.name)

    # Apply layout
    tmux.apply_layout()

    print(f"\033[32mOpened {path.name} in glow pane {pane_id}\033[0m")
    return pane_id


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m brain.skills.glow <file>")
        print("Example: python -m brain.skills.glow IRIS.md")
        sys.exit(1)

    filepath = sys.argv[1]
    result = open_glow(filepath)
    sys.exit(0 if result else 1)
