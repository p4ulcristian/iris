"""Spawn skill CLI entry point."""

import sys
from .main import spawn_god, list_gods


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m brain.skills.spawn [--god <name>] [--project <name>] \"<task>\"")
        print("       python -m brain.skills.spawn --list")
        sys.exit(1)

    args = sys.argv[1:]

    # Handle --list
    if args[0] == "--list":
        print("\nAvailable gods:")
        for god in list_gods():
            print(f"  {god.capitalize()}")
        return

    # Parse spawn args
    god_name = None
    project = None
    task = None

    i = 0
    while i < len(args):
        if args[i] == "--god" and i + 1 < len(args):
            god_name = args[i + 1]
            i += 2
        elif args[i] == "--project" and i + 1 < len(args):
            project = args[i + 1]
            i += 2
        elif args[i].startswith("--"):
            print(f"\033[31mUnknown option: {args[i]}\033[0m")
            sys.exit(1)
        else:
            task = " ".join(args[i:])
            break

    if not task:
        print("\033[31mNo task specified\033[0m")
        sys.exit(1)

    result = spawn_god(task, god_name=god_name, project=project)
    sys.exit(0 if result else 1)


if __name__ == "__main__":
    main()
