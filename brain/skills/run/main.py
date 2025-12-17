"""Run - command execution pane.

Runs commands in a tmux pane alongside the workers so you can watch the output.
"""

import sys
import shlex
from pathlib import Path

from brain.cli import tmux, config


def run_command(command: str, cwd: str | None = None, title: str | None = None) -> str | None:
    """Run a command in a new tmux pane.

    Args:
        command: The command to run
        cwd: Working directory (optional)
        title: Pane title (optional, auto-generated from command if not provided)

    Returns:
        Pane ID if successful, None otherwise
    """
    if not command:
        print("\033[31mNo command specified\033[0m")
        return None

    if not tmux.session_exists():
        print("\033[31mIris session not running\033[0m")
        return None

    # Build the full command
    if cwd:
        cwd_path = Path(cwd).expanduser().resolve()
        if not cwd_path.exists():
            print(f"\033[31mDirectory not found: {cwd_path}\033[0m")
            return None
        full_command = f"cd {shlex.quote(str(cwd_path))} && {command}"
    else:
        full_command = command

    # Create pane with command
    result = tmux.run(
        "split-window", "-t", config.SESSION, "-d", "-h",
        "-P", "-F", "#{pane_id}",
        full_command
    )

    if result.returncode != 0:
        print("\033[31mFailed to create run pane\033[0m")
        return None

    pane_id = result.stdout.strip()

    # Set title - use provided title or extract from command
    if title:
        pane_title = f"Run|{title}"
    else:
        # Extract first word/program from command for title
        cmd_name = command.split()[0].split("/")[-1] if command else "cmd"
        pane_title = f"Run|{cmd_name}"

    tmux.set_pane_title(pane_id, pane_title)

    # Apply layout
    tmux.apply_layout()

    print(f"\033[32mRunning '{command}' in pane {pane_id}\033[0m")
    return pane_id


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m brain.skills.run <command> [--cwd <dir>] [--title <title>]")
        print("Example: python -m brain.skills.run './start-dev.sh'")
        print("Example: python -m brain.skills.run 'npm run dev' --cwd ~/Work/myproject")
        print("Example: python -m brain.skills.run './start-dev.sh' --title ironrainbow")
        sys.exit(1)

    # Parse arguments
    args = sys.argv[1:]
    command = None
    cwd = None
    title = None

    i = 0
    while i < len(args):
        if args[i] == "--cwd" and i + 1 < len(args):
            cwd = args[i + 1]
            i += 2
        elif args[i] == "--title" and i + 1 < len(args):
            title = args[i + 1]
            i += 2
        elif command is None:
            command = args[i]
            i += 1
        else:
            # Append to command if there's more
            command = f"{command} {args[i]}"
            i += 1

    if not command:
        print("\033[31mNo command specified\033[0m")
        sys.exit(1)

    result = run_command(command, cwd=cwd, title=title)
    sys.exit(0 if result else 1)
