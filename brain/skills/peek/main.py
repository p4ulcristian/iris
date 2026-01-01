"""Peek - view another god's terminal output directly from Zellij."""

import os
import sys
import subprocess
import tempfile
import time


def get_session_name(god_name: str) -> str:
    """Get the zellij session name for a god."""
    return f"iris-{god_name.lower()}"


def session_exists(god_name: str) -> bool:
    """Check if a zellij session exists for this god."""
    session_name = get_session_name(god_name)
    try:
        result = subprocess.run(
            ["zellij", "list-sessions"],
            capture_output=True,
            text=True,
            timeout=5
        )
        return session_name in result.stdout
    except Exception:
        return False


def get_scrollback_from_zellij(god_name: str) -> str | None:
    """Get scrollback directly from Zellij session.

    Briefly attaches to the session in a pseudo-TTY context to dump the screen.
    Works even when Iris is not running.
    """
    session_name = get_session_name(god_name)

    # Create a temp file for the scrollback
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        tmp_file = f.name

    try:
        # Use timeout + script to briefly attach and dump
        # script provides a pseudo-TTY which zellij needs
        # We attach in background, dump the screen, then kill the attach
        cmd = f'''
            script -q -c "
                zellij attach {session_name}
            " /dev/null &
            ATTACH_PID=$!
            sleep 0.5
            zellij -s {session_name} action dump-screen --full {tmp_file}
            kill $ATTACH_PID 2>/dev/null
        '''

        subprocess.run(
            ["timeout", "3", "bash", "-c", cmd],
            capture_output=True,
            timeout=5
        )

        # Give it a moment
        time.sleep(0.2)

        if os.path.exists(tmp_file) and os.path.getsize(tmp_file) > 0:
            with open(tmp_file, 'r') as f:
                content = f.read()
            return content

        return None
    except subprocess.TimeoutExpired:
        return None
    except Exception as e:
        print(f"Zellij error: {e}", file=sys.stderr)
        return None
    finally:
        # Clean up temp file
        if os.path.exists(tmp_file):
            os.remove(tmp_file)


def get_scrollback_from_iris(god_name: str, lines: int) -> str | None:
    """Get scrollback via Iris WebSocket (fallback)."""
    try:
        from brain.skills.ws import peek_god
        return peek_god(god_name, lines)
    except Exception:
        return None


def strip_ansi(text: str) -> str:
    """Remove ANSI escape codes from text."""
    import re
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    return ansi_escape.sub('', text)


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
    strip_codes = False

    # Parse arguments
    for arg in sys.argv[2:]:
        if arg == "--strip" or arg == "-s":
            strip_codes = True
        else:
            try:
                lines = int(arg)
            except ValueError:
                print(f"Invalid argument: {arg}")
                sys.exit(1)

    # Check if session exists first
    if not session_exists(god_name):
        print(f"\033[31mNo session found for {god_name}\033[0m", file=sys.stderr)
        print(f"Available sessions:", file=sys.stderr)
        subprocess.run(["zellij", "list-sessions"], timeout=5)
        sys.exit(1)

    # Try Zellij directly first (works without Iris)
    output = get_scrollback_from_zellij(god_name)

    # Fall back to Iris WebSocket if Zellij didn't work
    if not output:
        output = get_scrollback_from_iris(god_name, lines)

    if output is None:
        print(f"\033[31mFailed to peek at {god_name}\033[0m", file=sys.stderr)
        print("Could not get scrollback from Zellij or Iris.", file=sys.stderr)
        sys.exit(1)

    if not output.strip():
        print(f"\033[33mNo output captured for {god_name}\033[0m")
        sys.exit(0)

    # Optionally strip ANSI codes
    if strip_codes:
        output = strip_ansi(output)

    # Apply line limit
    all_lines = output.split('\n')
    if len(all_lines) > lines:
        output = '\n'.join(all_lines[-lines:])

    print(output)
