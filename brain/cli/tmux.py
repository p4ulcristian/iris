"""Tmux session and pane management."""

import subprocess
import shutil
from dataclasses import dataclass

from . import config


SHADE_COLORS = {
    "ruby", "amber", "sol", "jade", "azure", "indigo",
    "violet", "coral", "cyan", "magenta", "crimson", "gold"
}


@dataclass
class Pane:
    """Represents a tmux pane."""
    pane_id: str
    title: str

    @property
    def is_shade(self) -> bool:
        """Check if this pane is a shade (title starts with ColorName:)."""
        if ":" not in self.title:
            return False
        name_part = self.title.split(":")[0].strip().lower()
        return name_part in SHADE_COLORS

    @property
    def shade_name(self) -> str | None:
        """Get shade name from title (e.g., 'Ruby' from 'Ruby: Fix bug')."""
        if not self.is_shade:
            return None
        return self.title.split(":")[0].strip()

    @property
    def shade_task(self) -> str | None:
        """Get shade task from title (e.g., 'Fix bug' from 'Ruby: Fix bug')."""
        if not self.is_shade:
            return None
        parts = self.title.split(":", 1)
        return parts[1].strip() if len(parts) > 1 else ""


def run(*args, capture=True, check=False) -> subprocess.CompletedProcess:
    """Run a tmux command."""
    cmd = ["tmux"] + list(args)
    return subprocess.run(
        cmd,
        capture_output=capture,
        text=True,
        check=check,
    )


def session_exists() -> bool:
    """Check if the iris session exists."""
    result = run("has-session", "-t", config.SESSION)
    return result.returncode == 0


def start_session():
    """Start the iris tmux session."""
    if session_exists():
        print("\033[33mIris session already running\033[0m")
        focus_session()
        return

    # Get colors - main pane is a shade too
    border_colors = config.get_border_colors()
    shade_color = config.get_next_shade_color(set())  # No shades yet, pick first available
    color_name = shade_color["name"]
    color_bg = shade_color.get("bg", "#1a1a1a")
    color_fg = shade_color.get("fg", "#ffffff")

    # Build Claude command using shade prompt template
    task = "Help Paul with whatever he needs."
    prompt_template = config.get_shade_prompt()
    shade_prompt = prompt_template.replace("{{COLOR_NAME}}", color_name)
    shade_prompt = shade_prompt.replace("{{WORKER_UUID}}", f"{color_name.lower()}-init")
    shade_prompt = shade_prompt.replace("{{VOICE}}", "emma")
    shade_prompt = shade_prompt.replace("{{TASK}}", task)
    escaped = shade_prompt.replace("'", "'\"'\"'")
    claude_cmd = f"cd '{config.IRIS_DIR}' && claude --dangerously-skip-permissions -- '{escaped}'"

    # Create session with command directly (so pane closes when Claude exits)
    run("new-session", "-d", "-s", config.SESSION, claude_cmd)

    # Style the session
    run("set-option", "-t", config.SESSION, "status", "off")
    run("set-option", "-t", config.SESSION, "pane-border-status", "top")
    run("set-option", "-t", config.SESSION, "pane-border-lines", "heavy")
    run("set-option", "-t", config.SESSION, "pane-border-style", f"fg={border_colors['bg']},bg={border_colors['bg']}")
    run("set-option", "-t", config.SESSION, "pane-active-border-style", f"fg={border_colors['bg']},bg={border_colors['bg']}")
    run("set-option", "-t", config.SESSION, "pane-border-format", f"#[bg={border_colors['bg']},fg={border_colors['fg']},bold] #{{pane_title}} ")
    run("set-option", "-t", config.SESSION, "allow-set-title", "off")

    # Style main pane as a shade
    run("select-pane", "-t", config.SESSION, "-P", f"bg={color_bg},fg={color_fg}")
    run("select-pane", "-t", config.SESSION, "-T", f"{color_name}: {task}")

    print(f"\033[32mIris session started ({color_name})\033[0m")
    focus_session()


def focus_session():
    """Focus or open the iris session in a terminal."""
    # Check if already attached in a ghostty window
    result = subprocess.run(
        ["pgrep", "-f", f"ghostty.*tmux attach.*{config.SESSION}"],
        capture_output=True,
    )

    if result.returncode == 0:
        # Try to focus existing window
        subprocess.run(["hyprctl", "dispatch", "focuswindow", "class:com.mitchellh.ghostty"],
                      capture_output=True)
    else:
        # Check if ghostty exists
        if shutil.which("ghostty"):
            subprocess.Popen(["ghostty", "-e", "tmux", "attach", "-t", config.SESSION])
        else:
            # Fallback: just attach in current terminal
            subprocess.run(["tmux", "attach", "-t", config.SESSION])


def kill_session():
    """Kill the iris tmux session."""
    if not session_exists():
        print("\033[33mIris session not running\033[0m")
        return
    run("kill-session", "-t", config.SESSION)
    print("\033[32mIris session stopped\033[0m")


def list_panes() -> list[Pane]:
    """List all panes in the iris session."""
    if not session_exists():
        return []

    result = run("list-panes", "-t", config.SESSION, "-F", "#{pane_id}:#{pane_title}")
    if result.returncode != 0:
        return []

    panes = []
    for line in result.stdout.strip().split("\n"):
        if ":" in line:
            pane_id, title = line.split(":", 1)
            panes.append(Pane(pane_id=pane_id, title=title))
    return panes


def create_pane(command: str) -> str | None:
    """Create a new pane and run a command in it."""
    if not session_exists():
        return None

    result = run("split-window", "-t", config.SESSION, "-d", "-h", "-P", "-F", "#{pane_id}", command)
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def kill_pane(pane_id: str) -> bool:
    """Kill a pane by ID."""
    result = run("kill-pane", "-t", pane_id)
    return result.returncode == 0


def set_pane_title(pane_id: str, title: str):
    """Set a pane's title."""
    run("select-pane", "-t", pane_id, "-T", title)


def set_pane_style(pane_id: str, bg_color: str, fg_color: str = "#ffffff"):
    """Set a pane's background and foreground colors."""
    run("select-pane", "-t", pane_id, "-P", f"bg={bg_color},fg={fg_color}")


def send_keys(pane_id: str, keys: str, enter: bool = True):
    """Send keys to a pane."""
    # Use -l for literal text to avoid interpretation
    run("send-keys", "-t", pane_id, "-l", keys)
    if enter:
        # Send Enter as separate command
        run("send-keys", "-t", pane_id, "Enter")


def capture_pane(pane_id: str, lines: int = 30) -> str:
    """Capture output from a pane."""
    result = run("capture-pane", "-t", pane_id, "-p")
    if result.returncode != 0:
        return ""

    output_lines = result.stdout.split("\n")
    return "\n".join(output_lines[-lines:])


def pipe_pane(pane_id: str, command: str | None):
    """Start or stop piping pane output to a command."""
    if command:
        run("pipe-pane", "-t", pane_id, command)
    else:
        run("pipe-pane", "-t", pane_id)  # Stop piping


def _layout_checksum(layout_str: str) -> str:
    """Calculate tmux layout checksum (csum16)."""
    csum = 0
    for c in layout_str:
        csum = (csum >> 1) + ((csum & 1) << 15)
        csum += ord(c)
        csum &= 0xffff
    return f"{csum:04x}"


def apply_layout():
    """Apply grid layout: Iris on left 50%, shades in grid on right 50%.

    Grid pattern (n shades):
    - 1: single pane
    - 2: stacked vertically (1 column)
    - 3: 2 columns [1, 2] (first col 1 pane, second col 2 stacked)
    - 4: 2 columns [2, 2]
    - 5: 3 columns [1, 2, 2]
    - 6: 3 columns [2, 2, 2]
    - etc.

    Formula: cols = ceil(n/2), first col gets fewer if odd count
    """
    if not session_exists():
        return

    panes = list_panes()
    # Sort by pane_id for consistent ordering
    all_panes = sorted(panes, key=lambda p: int(p.pane_id[1:]))

    if len(all_panes) <= 1:
        return  # Just Iris or nothing

    iris_pane = all_panes[0]  # Should be %0
    shade_panes = all_panes[1:]
    n = len(shade_panes)

    # Get window dimensions
    result = run("display-message", "-t", config.SESSION, "-p", "#{window_width}x#{window_height}")
    if result.returncode != 0:
        return

    try:
        dims = result.stdout.strip().split("x")
        W = int(dims[0])
        H = int(dims[1])
    except (ValueError, IndexError):
        return

    # Iris gets left ~50%
    iris_w = W // 2
    shade_area_x = iris_w + 1
    shade_area_w = W - shade_area_x

    # Calculate grid distribution
    if n <= 2:
        cols = 1
        distribution = [n]
    else:
        cols = (n + 1) // 2  # ceil(n/2)
        base = n // cols
        extra = n % cols
        # First columns get fewer if odd
        distribution = [base if i < cols - extra else base + 1 for i in range(cols)]

    # Helper to get pane number without % prefix
    def pane_num(p):
        return p.pane_id[1:]

    # Build column layouts
    shade_idx = 0
    col_layouts = []
    col_w = shade_area_w // cols if cols > 0 else shade_area_w

    for col_idx, col_count in enumerate(distribution):
        col_x = shade_area_x + col_idx * (col_w + 1)
        # Last column takes remaining width
        this_col_w = col_w if col_idx < cols - 1 else W - col_x

        if col_count == 1:
            # Single pane in column
            pane = shade_panes[shade_idx]
            col_layouts.append(f"{this_col_w}x{H},{col_x},0,{pane_num(pane)}")
            shade_idx += 1
        else:
            # Vertical stack of panes
            pane_h = H // col_count
            pane_layouts = []
            for row_idx in range(col_count):
                pane = shade_panes[shade_idx]
                y = row_idx * (pane_h + 1)
                # Last row takes remaining height
                h = pane_h if row_idx < col_count - 1 else H - y
                pane_layouts.append(f"{this_col_w}x{h},{col_x},{y},{pane_num(pane)}")
                shade_idx += 1
            col_layouts.append(f"{this_col_w}x{H},{col_x},0[{','.join(pane_layouts)}]")

    # Build shades area layout
    if cols == 1:
        shades_layout = col_layouts[0]
    else:
        shades_layout = f"{shade_area_w}x{H},{shade_area_x},0{{{','.join(col_layouts)}}}"

    # Full layout: iris + shades horizontally
    iris_layout = f"{iris_w}x{H},0,0,{pane_num(iris_pane)}"
    layout_body = f"{W}x{H},0,0{{{iris_layout},{shades_layout}}}"

    # Calculate checksum and apply
    checksum = _layout_checksum(layout_body)
    full_layout = f"{checksum},{layout_body}"

    run("select-layout", "-t", config.SESSION, full_layout)
