"""Nvim - neovim editor in Iris v2.

Opens files in a terminal using neovim.
"""

import sys
import shlex
from pathlib import Path

from brain.skills.ws import spawn_terminal


def open_nvim(*filepaths: str) -> bool:
    """Open files in a neovim terminal.

    Args:
        filepaths: Paths to files to open

    Returns:
        True if successful, False otherwise
    """
    if not filepaths:
        print("\033[31mNo files specified\033[0m")
        return False

    # Resolve all paths
    paths = []
    for fp in filepaths:
        path = Path(fp).expanduser().resolve()
        paths.append(path)

    # Check if files exist (warn but don't fail - nvim can create new files)
    for path in paths:
        if not path.exists():
            print(f"\033[33mNote: {path} does not exist (will be created)\033[0m")

    # Build nvim command
    quoted_paths = " ".join(shlex.quote(str(p)) for p in paths)
    nvim_cmd = f"nvim {quoted_paths}"

    # Name based on first file
    first_name = paths[0].name
    if len(paths) > 1:
        name = f"Nvim: {first_name} +{len(paths)-1}"
    else:
        name = f"Nvim: {first_name}"

    # Spawn terminal with nvim
    result = spawn_terminal(
        command=nvim_cmd,
        name=name,
        color="#a6e3a1"  # Green for nvim
    )

    if result:
        files_str = ", ".join(p.name for p in paths)
        print(f"\033[32mOpened {files_str} in nvim\033[0m")

    return result


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m brain.skills.nvim <file> [file2] [file3] ...")
        print("Example: python -m brain.skills.nvim src/main.py")
        print("Example: python -m brain.skills.nvim src/main.py src/utils.py")
        sys.exit(1)

    result = open_nvim(*sys.argv[1:])
    sys.exit(0 if result else 1)
