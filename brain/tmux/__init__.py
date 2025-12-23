"""Generic tmux session and pane management.

This module provides portable tmux operations that can be used
independently of Iris. All functions take session name as parameter.
"""
from __future__ import annotations

import math
import os
import subprocess
from dataclasses import dataclass


def darken_color(hex_color: str, factor: float = 0.5) -> str:
    """Darken a hex color by a factor (0-1)."""
    hex_color = hex_color.lstrip('#')
    r = int(int(hex_color[0:2], 16) * factor)
    g = int(int(hex_color[2:4], 16) * factor)
    b = int(int(hex_color[4:6], 16) * factor)
    return f"#{r:02x}{g:02x}{b:02x}"


def run(*args, env: dict | None = None, capture: bool = True) -> subprocess.CompletedProcess:
    """Run a tmux command.

    Args:
        *args: tmux command arguments
        env: Optional environment variables to pass
        capture: Whether to capture output (default True)
    """
    cmd = ["tmux"] + list(args)
    run_env = os.environ.copy()
    if env:
        run_env.update(env)
    return subprocess.run(
        cmd,
        capture_output=capture,
        text=True,
        env=run_env,
    )


# ─────────────────────────────────────────────────────────────────
# Session Operations
# ─────────────────────────────────────────────────────────────────

def session_exists(session: str) -> bool:
    """Check if a tmux session exists."""
    result = run("has-session", "-t", session)
    return result.returncode == 0


def create_session(
    session: str,
    window_name: str = "main",
    command: str | None = None,
    config_file: str | None = None,
    working_dir: str | None = None,
    env: dict | None = None,
) -> bool:
    """Create a new tmux session.

    Args:
        session: Session name
        window_name: Name for first window
        command: Command to run in first pane
        config_file: tmux config file to use
        working_dir: Working directory for the session
        env: Environment variables to set

    Returns:
        True if session was created
    """
    args = []
    if config_file:
        args.extend(["-f", config_file])
    args.extend(["new-session", "-d", "-s", session, "-n", window_name])
    if working_dir:
        args.extend(["-c", working_dir])
    if command:
        args.append(command)

    result = run(*args, env=env)
    return result.returncode == 0


def kill_session(session: str) -> bool:
    """Kill a tmux session."""
    result = run("kill-session", "-t", session)
    return result.returncode == 0


def set_environment(session: str, key: str, value: str) -> bool:
    """Set an environment variable in a tmux session."""
    result = run("set-environment", "-t", session, key, value)
    return result.returncode == 0


def set_option(session: str, option: str, value: str) -> bool:
    """Set a tmux option for a session."""
    result = run("set-option", "-t", session, option, value)
    return result.returncode == 0


# ─────────────────────────────────────────────────────────────────
# Pane Operations
# ─────────────────────────────────────────────────────────────────

@dataclass
class PaneInfo:
    """Basic pane information."""
    pane_id: str
    title: str


def list_panes(session: str) -> list[PaneInfo]:
    """List all panes in a session."""
    result = run("list-panes", "-t", session, "-F", "#{pane_id}:#{pane_title}")
    if result.returncode != 0:
        return []

    panes = []
    for line in result.stdout.strip().split("\n"):
        if ":" in line:
            pane_id, title = line.split(":", 1)
            panes.append(PaneInfo(pane_id=pane_id, title=title))
    return panes


def create_pane(
    session: str,
    command: str,
    horizontal: bool = True,
    env: dict | None = None,
) -> str | None:
    """Create a new pane and run a command.

    Args:
        session: Session name
        command: Command to run
        horizontal: Split horizontally (side by side) if True
        env: Environment variables

    Returns:
        Pane ID or None on failure
    """
    split_flag = "-h" if horizontal else "-v"
    result = run(
        "split-window", "-t", session, "-d", split_flag,
        "-P", "-F", "#{pane_id}", command,
        env=env,
    )
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def kill_pane(pane_id: str) -> bool:
    """Kill a pane by ID."""
    result = run("kill-pane", "-t", pane_id)
    return result.returncode == 0


def select_pane(session: str, pane_id: str) -> bool:
    """Select (focus) a pane."""
    result = run("select-pane", "-t", pane_id)
    return result.returncode == 0


def set_pane_title(pane_id: str, title: str) -> bool:
    """Set a pane's title."""
    result = run("select-pane", "-t", pane_id, "-T", title)
    return result.returncode == 0


def set_pane_style(pane_id: str, bg_color: str, fg_color: str = "#ffffff") -> bool:
    """Set a pane's background and foreground colors."""
    result = run("select-pane", "-t", pane_id, "-P", f"bg={bg_color},fg={fg_color}")
    return result.returncode == 0


def send_keys(pane_id: str, keys: str, enter: bool = True) -> bool:
    """Send keys to a pane.

    Args:
        pane_id: Target pane
        keys: Text to send
        enter: Whether to press Enter after
    """
    # Use -l for literal text to avoid interpretation
    result = run("send-keys", "-t", pane_id, "-l", keys)
    if result.returncode != 0:
        return False
    if enter:
        run("send-keys", "-t", pane_id, "Enter")
    return True


def capture_pane(pane_id: str, lines: int = 30) -> str:
    """Capture output from a pane."""
    result = run("capture-pane", "-t", pane_id, "-p")
    if result.returncode != 0:
        return ""

    output_lines = result.stdout.split("\n")
    return "\n".join(output_lines[-lines:])


def pipe_pane(pane_id: str, command: str | None) -> bool:
    """Start or stop piping pane output to a command.

    Args:
        pane_id: Target pane
        command: Shell command to pipe to, or None to stop
    """
    if command:
        result = run("pipe-pane", "-t", pane_id, command)
    else:
        result = run("pipe-pane", "-t", pane_id)  # Stop piping
    return result.returncode == 0


# ─────────────────────────────────────────────────────────────────
# Window Operations
# ─────────────────────────────────────────────────────────────────

def create_window(
    session: str,
    window_name: str,
    command: str,
    working_dir: str | None = None,
    env: dict | None = None,
) -> str | None:
    """Create a new window with a command.

    Args:
        session: Session name
        window_name: Name for the new window
        command: Command to run in the window
        working_dir: Working directory for the window
        env: Environment variables

    Returns:
        Pane ID of the new window's pane, or None on failure
    """
    args = ["new-window", "-t", session, "-n", window_name, "-P", "-F", "#{pane_id}"]
    if working_dir:
        args.extend(["-c", working_dir])
    args.append(command)

    result = run(*args, env=env)
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def get_window_dimensions(session: str) -> tuple[int, int] | None:
    """Get window width and height."""
    result = run("display-message", "-t", session, "-p", "#{window_width}x#{window_height}")
    if result.returncode != 0:
        return None
    try:
        dims = result.stdout.strip().split("x")
        return int(dims[0]), int(dims[1])
    except (ValueError, IndexError):
        return None


# ─────────────────────────────────────────────────────────────────
# Layout Operations
# ─────────────────────────────────────────────────────────────────

def _layout_checksum(layout_str: str) -> str:
    """Calculate tmux layout checksum (csum16)."""
    csum = 0
    for c in layout_str:
        csum = (csum >> 1) + ((csum & 1) << 15)
        csum += ord(c)
        csum &= 0xffff
    return f"{csum:04x}"


def apply_grid_layout(session: str, pane_ids: list[str] | None = None) -> bool:
    """Apply equal column grid layout for panes.

    Grid pattern (n panes) - columns with vertical splits:
    - 1: full screen
    - 2: [1 | 2] side by side
    - 3: [1 | 2/3] first col full, second col split
    - 4: [1/2 | 3/4] two columns, each split
    - 5: [1 | 2/3 | 4/5] three columns
    - etc.

    Args:
        session: Session name
        pane_ids: Optional list of pane IDs to layout (default: all panes)
    """
    if pane_ids is None:
        panes = list_panes(session)
        pane_ids = [p.pane_id for p in sorted(panes, key=lambda p: int(p.pane_id[1:]))]

    n = len(pane_ids)
    if n <= 1:
        return True  # Single pane, nothing to layout

    dims = get_window_dimensions(session)
    if not dims:
        return False
    W, H = dims

    def pane_num(pid: str) -> str:
        return pid[1:] if pid.startswith("%") else pid

    # Calculate grid dimensions
    if n <= 3:
        cols = n  # All side by side
    else:
        cols = math.ceil(math.sqrt(n))

    # Distribute panes across columns
    base_per_col = n // cols
    extra = n % cols
    col_counts = []
    for i in range(cols):
        count = base_per_col + (1 if i >= cols - extra else 0)
        col_counts.append(count)

    # Build layout string
    pane_idx = 0
    col_layouts = []
    col_w = W // cols

    for col_idx, rows_in_col in enumerate(col_counts):
        col_x = col_idx * (col_w + 1)
        this_col_w = col_w if col_idx < cols - 1 else W - col_x

        if rows_in_col == 1:
            pid = pane_ids[pane_idx]
            col_layouts.append(f"{this_col_w}x{H},{col_x},0,{pane_num(pid)}")
            pane_idx += 1
        else:
            row_h = H // rows_in_col
            pane_layouts = []
            for row_idx in range(rows_in_col):
                pid = pane_ids[pane_idx]
                row_y = row_idx * (row_h + 1)
                this_row_h = row_h if row_idx < rows_in_col - 1 else H - row_y
                pane_layouts.append(f"{this_col_w}x{this_row_h},{col_x},{row_y},{pane_num(pid)}")
                pane_idx += 1
            col_layouts.append(f"{this_col_w}x{H},{col_x},0[{','.join(pane_layouts)}]")

    layout_body = f"{W}x{H},0,0{{{','.join(col_layouts)}}}"
    checksum = _layout_checksum(layout_body)
    full_layout = f"{checksum},{layout_body}"

    result = run("select-layout", "-t", session, full_layout)
    return result.returncode == 0
