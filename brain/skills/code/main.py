"""Code skill - open and highlight code in the Iris code viewer.

Commands:
  open <file> [line] [--new]  - Open a file in the code viewer
  highlight <file> <lines> <color> [note] - Highlight lines
  clear [file]                - Clear highlights

Options:
  --new    Create a new code entity instead of reusing an existing one

Examples:
  python -m brain.skills.code open src/App.jsx
  python -m brain.skills.code open src/App.jsx 42
  python -m brain.skills.code open ~/Work/ironrainbow --new    # New instance for project
  python -m brain.skills.code highlight src/App.jsx 10-20 yellow "This is the auth logic"
  python -m brain.skills.code highlight src/App.jsx 5 red "Bug here"
  python -m brain.skills.code clear
  python -m brain.skills.code clear src/App.jsx
"""

import sys
import os

from brain.skills.ws import send_message


VALID_COLORS = ('yellow', 'red', 'green', 'blue', 'orange', 'purple', 'cyan')


def open_file(file_path: str, line: int = None, force_new: bool = False) -> bool:
    """Open a file in the Iris code viewer.

    Args:
        file_path: Path to the file (absolute or relative)
        line: Line number to jump to (optional)
        force_new: If True, always create a new code entity instead of reusing

    Returns:
        True if successful, False otherwise
    """
    # Resolve to absolute path
    if not os.path.isabs(file_path):
        file_path = os.path.abspath(file_path)

    msg = {
        "event": "code:open",
        "filePath": file_path
    }
    if line:
        msg["line"] = line
    if force_new:
        msg["forceNew"] = True

    result = send_message(msg)

    if result:
        if line:
            print(f"\033[32mOpening {file_path}:{line}\033[0m")
        else:
            print(f"\033[32mOpening {file_path}\033[0m")
    else:
        print(f"\033[31mFailed to open {file_path}\033[0m", file=sys.stderr)

    return result


def parse_lines(lines_str: str) -> list[tuple[int, int]]:
    """Parse line specification into list of (start, end) tuples.

    Supports:
      - Single line: "10" -> [(10, 10)]
      - Range: "10-20" -> [(10, 20)]
      - Multiple: "10,15,20-25" -> [(10, 10), (15, 15), (20, 25)]
    """
    ranges = []
    for part in lines_str.split(','):
        part = part.strip()
        if '-' in part:
            start, end = part.split('-', 1)
            ranges.append((int(start), int(end)))
        else:
            line = int(part)
            ranges.append((line, line))
    return ranges


def highlight(file_path: str, lines_str: str, color: str, note: str = None) -> bool:
    """Add highlights to a file in the code viewer.

    Args:
        file_path: Path to the file
        lines_str: Line specification (e.g., "10", "10-20", "5,10-15")
        color: Highlight color (yellow, red, green, blue, orange, purple, cyan)
        note: Optional note/explanation for the highlight

    Returns:
        True if successful, False otherwise
    """
    if color not in VALID_COLORS:
        print(f"\033[31mInvalid color: {color}. Must be one of: {', '.join(VALID_COLORS)}\033[0m", file=sys.stderr)
        return False

    # Resolve to absolute path
    if not os.path.isabs(file_path):
        file_path = os.path.abspath(file_path)

    try:
        ranges = parse_lines(lines_str)
    except ValueError as e:
        print(f"\033[31mInvalid line specification: {lines_str}\033[0m", file=sys.stderr)
        return False

    highlights = []
    for start, end in ranges:
        h = {"line": start, "endLine": end, "color": color}
        if note:
            h["note"] = note
        highlights.append(h)

    result = send_message({
        "event": "code:highlight",
        "filePath": file_path,
        "highlights": highlights
    })

    if result:
        print(f"\033[32mHighlighted {lines_str} in {color}\033[0m")
    else:
        print(f"\033[31mFailed to highlight\033[0m", file=sys.stderr)

    return result


def clear_highlights(file_path: str = None) -> bool:
    """Clear highlights from a file or all files.

    Args:
        file_path: Path to clear (optional, clears all if not specified)

    Returns:
        True if successful, False otherwise
    """
    msg = {"event": "code:highlight:clear"}

    if file_path:
        if not os.path.isabs(file_path):
            file_path = os.path.abspath(file_path)
        msg["filePath"] = file_path

    result = send_message(msg)

    if result:
        if file_path:
            print(f"\033[32mCleared highlights from {file_path}\033[0m")
        else:
            print(f"\033[32mCleared all highlights\033[0m")
    else:
        print(f"\033[31mFailed to clear highlights\033[0m", file=sys.stderr)

    return result


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == 'open':
        if len(sys.argv) < 3:
            print("Usage: python -m brain.skills.code open <file> [line] [--new]")
            sys.exit(1)
        # Parse args - check for --new flag
        args = sys.argv[2:]
        force_new = '--new' in args
        args = [a for a in args if a != '--new']

        file_path = args[0]
        line = int(args[1]) if len(args) > 1 else None
        result = open_file(file_path, line, force_new)
        sys.exit(0 if result else 1)

    elif command == 'highlight':
        if len(sys.argv) < 5:
            print("Usage: python -m brain.skills.code highlight <file> <lines> <color> [note]")
            print("Lines: single (10), range (10-20), or multiple (5,10-15)")
            print(f"Colors: {', '.join(VALID_COLORS)}")
            sys.exit(1)
        file_path = sys.argv[2]
        lines_str = sys.argv[3]
        color = sys.argv[4]
        note = sys.argv[5] if len(sys.argv) > 5 else None
        result = highlight(file_path, lines_str, color, note)
        sys.exit(0 if result else 1)

    elif command == 'clear':
        file_path = sys.argv[2] if len(sys.argv) > 2 else None
        result = clear_highlights(file_path)
        sys.exit(0 if result else 1)

    else:
        print(f"Unknown command: {command}")
        print(__doc__)
        sys.exit(1)
