"""Nvim-highlight - highlight code ranges in neovim.

Highlights lines or ranges in an existing nvim pane for demos and AI-assisted code reviews.
Non-destructive - uses extmarks that don't modify the file.
"""

import sys
import time
import tempfile
import os
from pathlib import Path

from brain.cli import tmux, config


# Highlight color presets (name -> hex bg color)
HIGHLIGHT_COLORS = {
    "yellow": "#ffff00",    # General attention
    "green": "#55ff55",     # Added / new code
    "red": "#ff5555",       # Removed / problematic
    "blue": "#5555ff",      # Info / context
    "orange": "#ffaa00",    # Warning
    "purple": "#aa55ff",    # Special / magic
    "cyan": "#00ffff",      # Highlight
}

# Namespace for iris highlights
IRIS_NS = "iris_demo"


def find_nvim_pane() -> str | None:
    """Find an existing nvim pane in the Iris session.

    Returns:
        Pane ID if found, None otherwise
    """
    panes = tmux.list_panes()
    for pane in panes:
        # Nvim panes have titles ending with /
        if pane.title.endswith("/") and not pane.is_shade:
            return pane.pane_id
    return None


def _send_nvim_lua(pane_id: str, lua_code: str):
    """Send Lua code to nvim via tmux.

    Args:
        pane_id: The tmux pane ID running nvim
        lua_code: Lua code to execute
    """
    # Write lua to temp file
    fd, tmp_path = tempfile.mkstemp(suffix='.lua', prefix='iris_')
    try:
        os.write(fd, lua_code.encode())
        os.close(fd)

        # Escape to normal mode first
        tmux.run("send-keys", "-t", pane_id, "Escape")
        time.sleep(0.05)

        # Source the lua file
        tmux.run("send-keys", "-t", pane_id, f":luafile {tmp_path}", "Enter")
        time.sleep(0.1)
    finally:
        # Clean up temp file after a delay
        time.sleep(0.1)
        os.unlink(tmp_path)


def setup(pane_id: str = None):
    """Setup highlight groups in nvim.

    Args:
        pane_id: Target pane ID, or auto-detect if None
    """
    pane_id = pane_id or find_nvim_pane()
    if not pane_id:
        print("\033[31mNo nvim pane found\033[0m")
        return False

    # Create namespace and all highlight groups in one lua call
    lua_lines = [f"vim.api.nvim_create_namespace('{IRIS_NS}')"]
    for name, color in HIGHLIGHT_COLORS.items():
        fg = "#000000" if name in ["yellow", "green", "cyan", "orange"] else "#ffffff"
        lua_lines.append(f"vim.api.nvim_set_hl(0, 'Iris{name.capitalize()}', {{bg = '{color}', fg = '{fg}'}})")

    _send_nvim_lua(pane_id, "\n".join(lua_lines))

    print(f"\033[32mHighlight groups setup in pane {pane_id}\033[0m")
    return True


def lines(start_line: int, end_line: int = None, color: str = "yellow", pane_id: str = None):
    """Highlight lines in nvim.

    Args:
        start_line: First line to highlight (1-indexed, human-friendly)
        end_line: Last line to highlight (inclusive), or None for single line
        color: Color name from HIGHLIGHT_COLORS
        pane_id: Target pane ID, or auto-detect if None
    """
    pane_id = pane_id or find_nvim_pane()
    if not pane_id:
        print("\033[31mNo nvim pane found\033[0m")
        return False

    end_line = end_line or start_line
    color = color.lower()
    if color not in HIGHLIGHT_COLORS:
        print(f"\033[31mUnknown color: {color}. Available: {', '.join(HIGHLIGHT_COLORS.keys())}\033[0m")
        return False

    hl_group = f"Iris{color.capitalize()}"

    # Convert to 0-indexed for nvim API
    start_idx = start_line - 1
    end_idx = end_line  # end_row is exclusive, so no -1

    lua = f"""
local ns = vim.api.nvim_create_namespace('{IRIS_NS}')
for line = {start_idx}, {end_idx - 1} do
  vim.api.nvim_buf_set_extmark(0, ns, line, 0, {{
    line_hl_group = '{hl_group}',
    hl_eol = true,
    priority = 1000
  }})
end
"""

    _send_nvim_lua(pane_id, lua)

    line_desc = f"line {start_line}" if start_line == end_line else f"lines {start_line}-{end_line}"
    print(f"\033[32mHighlighted {line_desc} in {color}\033[0m")
    return True


def range(line: int, start_col: int, end_col: int, color: str = "yellow", pane_id: str = None):
    """Highlight a specific range within a line.

    Args:
        line: Line number (1-indexed)
        start_col: Start column (1-indexed)
        end_col: End column (1-indexed, inclusive)
        color: Color name from HIGHLIGHT_COLORS
        pane_id: Target pane ID, or auto-detect if None
    """
    pane_id = pane_id or find_nvim_pane()
    if not pane_id:
        print("\033[31mNo nvim pane found\033[0m")
        return False

    color = color.lower()
    if color not in HIGHLIGHT_COLORS:
        print(f"\033[31mUnknown color: {color}\033[0m")
        return False

    hl_group = f"Iris{color.capitalize()}"

    # Convert to 0-indexed
    line_idx = line - 1
    start_col_idx = start_col - 1
    end_col_idx = end_col  # exclusive

    lua = f"""
local ns = vim.api.nvim_create_namespace('{IRIS_NS}')
vim.api.nvim_buf_set_extmark(0, ns, {line_idx}, {start_col_idx}, {{
  end_col = {end_col_idx},
  hl_group = '{hl_group}',
  priority = 1000
}})
"""

    _send_nvim_lua(pane_id, lua)
    print(f"\033[32mHighlighted line {line}, cols {start_col}-{end_col} in {color}\033[0m")
    return True


def clear(pane_id: str = None):
    """Clear all iris highlights from nvim.

    Args:
        pane_id: Target pane ID, or auto-detect if None
    """
    pane_id = pane_id or find_nvim_pane()
    if not pane_id:
        print("\033[31mNo nvim pane found\033[0m")
        return False

    lua = f"vim.api.nvim_buf_clear_namespace(0, vim.api.nvim_create_namespace('{IRIS_NS}'), 0, -1)"
    _send_nvim_lua(pane_id, lua)

    print(f"\033[32mCleared all iris highlights\033[0m")
    return True


def goto(line: int, pane_id: str = None):
    """Jump to a specific line in nvim.

    Args:
        line: Line number to go to (1-indexed)
        pane_id: Target pane ID, or auto-detect if None
    """
    pane_id = pane_id or find_nvim_pane()
    if not pane_id:
        print("\033[31mNo nvim pane found\033[0m")
        return False

    # Use vim command to go to line and center it
    tmux.run("send-keys", "-t", pane_id, "Escape")
    time.sleep(0.05)
    tmux.run("send-keys", "-t", pane_id, f":{line}", "Enter")
    time.sleep(0.05)
    tmux.run("send-keys", "-t", pane_id, "zz")

    print(f"\033[32mJumped to line {line}\033[0m")
    return True


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m brain.skills.nvim-highlight <command> [args]")
        print("")
        print("Commands:")
        print("  setup                   Setup highlight groups")
        print("  lines <start> [end] [color]  Highlight line(s)")
        print("  range <line> <start_col> <end_col> [color]  Highlight range")
        print("  clear                   Clear all highlights")
        print("  goto <line>             Jump to line")
        print("")
        print("Colors: yellow, green, red, blue, orange, purple, cyan")
        print("")
        print("Examples:")
        print("  python -m brain.skills.nvim-highlight setup")
        print("  python -m brain.skills.nvim-highlight lines 10 20 green")
        print("  python -m brain.skills.nvim-highlight range 5 10 25 yellow")
        print("  python -m brain.skills.nvim-highlight clear")
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "setup":
        result = setup()
        sys.exit(0 if result else 1)

    elif cmd == "lines":
        if len(sys.argv) < 3:
            print("Usage: lines <start_line> [end_line] [color]")
            sys.exit(1)
        start = int(sys.argv[2])
        end = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3].isdigit() else None
        color = sys.argv[-1] if len(sys.argv) > 3 and not sys.argv[-1].isdigit() else "yellow"
        result = lines(start, end, color)
        sys.exit(0 if result else 1)

    elif cmd == "range":
        if len(sys.argv) < 5:
            print("Usage: range <line> <start_col> <end_col> [color]")
            sys.exit(1)
        line_num = int(sys.argv[2])
        start_col = int(sys.argv[3])
        end_col = int(sys.argv[4])
        color = sys.argv[5] if len(sys.argv) > 5 else "yellow"
        result = range(line_num, start_col, end_col, color)
        sys.exit(0 if result else 1)

    elif cmd == "clear":
        result = clear()
        sys.exit(0 if result else 1)

    elif cmd == "goto":
        if len(sys.argv) < 3:
            print("Usage: goto <line>")
            sys.exit(1)
        line_num = int(sys.argv[2])
        result = goto(line_num)
        sys.exit(0 if result else 1)

    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)


if __name__ == "__main__":
    main()
