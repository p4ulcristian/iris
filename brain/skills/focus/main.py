"""Focus - update god's pane title with current activity."""

import os
import sys

from brain.cli import config, tmux


def update_focus(status: str) -> bool:
    """Update pane title with current status.

    Args:
        status: Short description of current activity

    Returns:
        True if successful, False otherwise
    """
    uuid = os.environ.get("GOD_UUID")
    name = os.environ.get("GOD_NAME")

    if not uuid or not name:
        print("\033[31mNot running as a god\033[0m")
        return False

    shadow_dir = config.SHADOWS_DIR / uuid
    if not shadow_dir.exists():
        print(f"\033[31mShadow folder not found: {uuid}\033[0m")
        return False

    # Save to shadow folder
    (shadow_dir / "current_task.txt").write_text(status)

    # Update tmux title
    pane_file = shadow_dir / "pane_id.txt"
    if pane_file.exists():
        pane_id = pane_file.read_text().strip()
        display = status[:40] + "..." if len(status) > 40 else status
        tmux.set_pane_title(pane_id, f"{name}: {display}")
        return True

    return False


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m brain.skills.focus <status>")
        print("Example: python -m brain.skills.focus 'reading tests'")
        print("Example: python -m brain.skills.focus 'fixing auth bug'")
        sys.exit(1)

    status = " ".join(sys.argv[1:])
    result = update_focus(status)
    sys.exit(0 if result else 1)
