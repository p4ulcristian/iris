"""Nvim - neovim editor pane.

Opens files in a tmux pane using neovim. Multiple files open as tabs.
"""

import sys
from pathlib import Path

from brain.cli import tmux, config


def open_nvim(*filepaths: str) -> str | None:
    """Open files in a new nvim pane.

    Args:
        filepaths: Paths to files (absolute or relative to IRIS_DIR).
                   Multiple files open as nvim tabs.

    Returns:
        Pane ID if successful, None otherwise
    """
    if not filepaths:
        print("\033[31mNo files specified\033[0m")
        return None

    # Resolve paths
    resolved = []
    for filepath in filepaths:
        path = Path(filepath)
        if not path.is_absolute():
            path = Path(config.IRIS_DIR) / filepath
        resolved.append(str(path))

    if not tmux.session_exists():
        print("\033[31mIris session not running\033[0m")
        return None

    # Determine working directory and nvim args
    first_path = Path(resolved[0])
    if first_path.is_dir():
        # Opening a directory - cd there and open nvim
        work_dir = str(first_path)
        nvim_cmd = f"cd {work_dir} && nvim ."
    else:
        # Opening file(s) - cd to parent directory
        work_dir = str(first_path.parent)
        if len(resolved) == 1:
            nvim_cmd = f"cd {work_dir} && nvim {resolved[0]}"
        else:
            # -p opens files in tabs
            files_str = " ".join(f'"{f}"' for f in resolved)
            nvim_cmd = f"cd {work_dir} && nvim -p {files_str}"

    # Create pane with nvim
    result = tmux.run(
        "split-window", "-t", config.SESSION, "-d", "-h",
        "-P", "-F", "#{pane_id}",
        "bash", "-c", nvim_cmd
    )

    if result.returncode != 0:
        print("\033[31mFailed to create nvim pane\033[0m")
        return None

    pane_id = result.stdout.strip()

    # Set title - show folder name
    first_path = Path(resolved[0])
    if first_path.is_dir():
        folder_name = first_path.name
    else:
        folder_name = first_path.parent.name

    tmux.set_pane_title(pane_id, f"{folder_name}/")

    # Apply layout
    tmux.apply_layout()

    files_msg = f"{len(resolved)} files" if len(resolved) > 1 else first_name
    print(f"\033[32mOpened {files_msg} in nvim pane {pane_id}\033[0m")
    return pane_id


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m brain.skills.nvim <file> [file2] [file3] ...")
        print("Example: python -m brain.skills.nvim IRIS.md")
        print("Example: python -m brain.skills.nvim src/main.py src/utils.py")
        sys.exit(1)

    filepaths = sys.argv[1:]
    result = open_nvim(*filepaths)
    sys.exit(0 if result else 1)
