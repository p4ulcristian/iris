"""Run - command execution in Iris v2.

Runs commands in a terminal so you can watch the output.
"""

import sys
from pathlib import Path

from brain.skills.ws import spawn_terminal


def run_command(command: str, cwd: str = None, title: str = None) -> bool:
    """Run a command in a new terminal.

    Args:
        command: The command to run
        cwd: Working directory (optional)
        title: Terminal title (optional)

    Returns:
        True if successful, False otherwise
    """
    if not command:
        print("\033[31mNo command specified\033[0m")
        return False

    # Resolve cwd if provided
    work_dir = None
    if cwd:
        cwd_path = Path(cwd).expanduser().resolve()
        if not cwd_path.exists():
            print(f"\033[31mDirectory not found: {cwd_path}\033[0m")
            return False
        work_dir = str(cwd_path)

    # Build name
    if title:
        name = f"Run: {title}"
    else:
        cmd_display = command[:30] + "..." if len(command) > 30 else command
        name = f"Run: {cmd_display}"

    # Spawn terminal with command
    result = spawn_terminal(
        command=command,
        name=name,
        color="#fab387",  # Orange for run
        cwd=work_dir
    )

    if result:
        print(f"\033[32mRunning: {command}\033[0m")

    return result


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m brain.skills.run <command> [--cwd <dir>] [--title <title>]")
        print("Example: python -m brain.skills.run './start-dev.sh'")
        print("Example: python -m brain.skills.run 'npm run dev' --cwd ~/Work/myproject")
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
            command = f"{command} {args[i]}"
            i += 1

    if not command:
        print("\033[31mNo command specified\033[0m")
        sys.exit(1)

    result = run_command(command, cwd=cwd, title=title)
    sys.exit(0 if result else 1)
