"""Peek - view another god's terminal output."""

import sys
from brain.skills.ws import peek_god


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m brain.skills.peek <god_name> [lines]")
        print()
        print("Examples:")
        print("  python -m brain.skills.peek zeus        # Last 50 lines")
        print("  python -m brain.skills.peek zeus 100    # Last 100 lines")
        print("  python -m brain.skills.peek Athena 20   # Last 20 lines")
        sys.exit(1)

    god_name = sys.argv[1]
    lines = 50

    if len(sys.argv) >= 3:
        try:
            lines = int(sys.argv[2])
        except ValueError:
            print(f"Invalid line count: {sys.argv[2]}")
            sys.exit(1)

    output = peek_god(god_name, lines)

    if output is None:
        print(f"\033[31mFailed to peek at {god_name}\033[0m", file=sys.stderr)
        print("Make sure the god exists and is attached to a terminal.", file=sys.stderr)
        sys.exit(1)

    if not output:
        print(f"\033[33mNo output captured for {god_name}\033[0m")
        print("The god may not have produced any output yet, or the terminal isn't attached.")
        sys.exit(0)

    print(output)
