"""Tmux session and pane management."""

import math
import subprocess
import shutil
from dataclasses import dataclass

from . import config


def darken_color(hex_color: str, factor: float = 0.5) -> str:
    """Darken a hex color by a factor (0-1)."""
    hex_color = hex_color.lstrip('#')
    r = int(int(hex_color[0:2], 16) * factor)
    g = int(int(hex_color[2:4], 16) * factor)
    b = int(int(hex_color[4:6], 16) * factor)
    return f"#{r:02x}{g:02x}{b:02x}"


GOD_NAMES = {
    "apollo", "artemis", "athena", "hermes", "hades", "poseidon",
    "hera", "ares", "hephaestus", "aphrodite", "dionysus", "demeter",
}


@dataclass
class Pane:
    """Represents a tmux pane."""
    pane_id: str
    title: str

    @property
    def is_god(self) -> bool:
        """Check if this pane is a god (title starts with GodName:)."""
        if ":" not in self.title:
            return False
        name_part = self.title.split(":")[0].strip().lower()
        return name_part in GOD_NAMES

    @property
    def god_name(self) -> str | None:
        """Get god name from title (e.g., 'Apollo' from 'Apollo: Fix bug')."""
        if not self.is_god:
            return None
        return self.title.split(":")[0].strip()

    @property
    def god_task(self) -> str | None:
        """Get god task from title (e.g., 'Fix bug' from 'Apollo: Fix bug')."""
        if not self.is_god:
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

    # Build Claude command using god prompt template
    task = "Help Paul with whatever he needs."
    god_config = config.get_god_config(color_name)
    voice = god_config.get("voice", "emma")
    traits = god_config.get("traits", "")

    prompt_template = config.get_god_prompt()
    god_prompt = prompt_template.replace("{{GOD_NAME}}", color_name)
    god_prompt = god_prompt.replace("{{GOD_UUID}}", f"{color_name.lower()}-init")
    god_prompt = god_prompt.replace("{{VOICE}}", voice)
    god_prompt = god_prompt.replace("{{TRAITS}}", traits)
    god_prompt = god_prompt.replace("{{TASK}}", task)
    escaped = god_prompt.replace("'", "'\"'\"'")
    claude_cmd = f"cd '{config.IRIS_DIR}' && claude --dangerously-skip-permissions -- '{escaped}'"

    # Create session with command directly (so pane closes when Claude exits)
    # First window is named "Olympus" (home of the gods)
    # Use -f to load iris config instead of global ~/.tmux.conf
    run("-f", str(config.TMUX_CONF), "new-session", "-d", "-s", config.SESSION, "-n", "Olympus", claude_cmd)

    # Style the session
    run("set-option", "-t", config.SESSION, "status", "off")
    run("set-option", "-t", config.SESSION, "pane-border-status", "top")
    run("set-option", "-t", config.SESSION, "pane-border-lines", "heavy")
    inactive_color = darken_color(border_colors['bg'], 0.4)
    run("set-option", "-t", config.SESSION, "pane-border-style", f"fg={inactive_color},bg={inactive_color}")
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
            subprocess.Popen(["ghostty", "-e", "tmux", "-f", str(config.TMUX_CONF), "attach", "-t", config.SESSION])
        else:
            # Fallback: just attach in current terminal
            subprocess.run(["tmux", "-f", str(config.TMUX_CONF), "attach", "-t", config.SESSION])


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
    """Apply equal column grid layout for all panes.

    Grid pattern (n panes) - columns with vertical splits:
    - 1: full screen
    - 2: [1 | 2] side by side
    - 3: [1 | 2/3] first col full, second col split vertically
    - 4: [1/2 | 3/4] two columns, each split vertically
    - 5: [1 | 2/3 | 4/5] three columns
    - 6: [1/2 | 3/4 | 5/6] three columns, each split
    - etc.

    Formula: cols = ceil(sqrt(n)), distribute panes across columns vertically
    """
    if not session_exists():
        return

    panes = list_panes()
    all_panes = sorted(panes, key=lambda p: int(p.pane_id[1:]))
    n = len(all_panes)

    if n <= 1:
        return  # Single pane, nothing to layout

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

    def pane_num(p):
        return p.pane_id[1:]

    # Calculate grid dimensions (columns first)
    # For small counts, prefer side-by-side columns
    # Only start stacking vertically at 4+ panes
    if n <= 3:
        cols = n  # All side by side
    else:
        cols = math.ceil(math.sqrt(n))

    # Distribute panes across columns (last columns get more if uneven)
    base_per_col = n // cols
    extra = n % cols
    col_counts = []
    for i in range(cols):
        # Last columns get extra panes
        count = base_per_col + (1 if i >= cols - extra else 0)
        col_counts.append(count)

    # Build layout string
    pane_idx = 0
    col_layouts = []
    col_w = W // cols

    for col_idx, rows_in_col in enumerate(col_counts):
        col_x = col_idx * (col_w + 1)
        # Last column takes remaining width
        this_col_w = col_w if col_idx < cols - 1 else W - col_x

        if rows_in_col == 1:
            # Single pane in column
            pane = all_panes[pane_idx]
            col_layouts.append(f"{this_col_w}x{H},{col_x},0,{pane_num(pane)}")
            pane_idx += 1
        else:
            # Multiple panes stacked vertically in column
            row_h = H // rows_in_col
            pane_layouts = []
            for row_idx in range(rows_in_col):
                pane = all_panes[pane_idx]
                row_y = row_idx * (row_h + 1)
                # Last row takes remaining height
                this_row_h = row_h if row_idx < rows_in_col - 1 else H - row_y
                pane_layouts.append(f"{this_col_w}x{this_row_h},{col_x},{row_y},{pane_num(pane)}")
                pane_idx += 1
            col_layouts.append(f"{this_col_w}x{H},{col_x},0[{','.join(pane_layouts)}]")

    # Build full layout
    layout_body = f"{W}x{H},0,0{{{','.join(col_layouts)}}}"

    # Calculate checksum and apply
    checksum = _layout_checksum(layout_body)
    full_layout = f"{checksum},{layout_body}"

    run("select-layout", "-t", config.SESSION, full_layout)
