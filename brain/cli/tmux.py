"""Tmux session and pane management."""

import subprocess
import shutil
from dataclasses import dataclass

from . import config


@dataclass
class Pane:
    """Represents a tmux pane."""
    pane_id: str
    title: str

    @property
    def is_shade(self) -> bool:
        """Check if this pane is a shade (has metadata in title)."""
        return "|" in self.title

    @property
    def shade_info(self) -> tuple[str, str, str] | None:
        """Parse shade info from title: (name, uuid, project)."""
        if not self.is_shade:
            return None
        parts = self.title.split("|")
        if len(parts) >= 3:
            return parts[0], parts[1], parts[2]
        return None


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

    # Create session
    run("new-session", "-d", "-s", config.SESSION)

    # Get colors
    iris_colors = config.get_iris_colors()
    border_colors = config.get_border_colors()

    # Style the session
    run("set-option", "-t", config.SESSION, "status", "off")
    run("set-option", "-t", config.SESSION, "pane-border-status", "top")
    run("set-option", "-t", config.SESSION, "pane-border-lines", "heavy")
    run("set-option", "-t", config.SESSION, "pane-border-style", f"fg={border_colors['bg']},bg={border_colors['bg']}")
    run("set-option", "-t", config.SESSION, "pane-active-border-style", f"fg={border_colors['bg']},bg={border_colors['bg']}")
    run("set-option", "-t", config.SESSION, "pane-border-format", f"#[bg={border_colors['bg']},fg={border_colors['fg']},bold] #{{pane_title}} ")
    run("set-option", "-t", config.SESSION, "allow-set-title", "off")

    # Style main pane
    run("select-pane", "-t", config.SESSION, "-P", f"bg={iris_colors['bg']}")
    run("select-pane", "-t", config.SESSION, "-T", "𓂀 Iris")

    # Start Claude in the main pane
    iris_prompt = config.get_iris_prompt()
    escaped = iris_prompt.replace("'", "'\"'\"'")
    run("send-keys", "-t", config.SESSION,
        f"cd '{config.IRIS_DIR}' && claude --dangerously-skip-permissions -- '{escaped}'",
        "Enter")

    print("\033[32mIris session started\033[0m")
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

    result = run("split-window", "-t", config.SESSION, "-h", "-P", "-F", "#{pane_id}", command)
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


def set_pane_style(pane_id: str, bg_color: str):
    """Set a pane's background color."""
    run("select-pane", "-t", pane_id, "-P", f"bg={bg_color}")


def send_keys(pane_id: str, keys: str, enter: bool = True):
    """Send keys to a pane."""
    args = ["send-keys", "-t", pane_id, keys]
    if enter:
        args.append("Enter")
    run(*args)


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


def apply_layout():
    """Apply a sensible layout to all panes."""
    if not session_exists():
        return

    # Use main-vertical layout: Iris on left, shades stacked on right
    run("select-layout", "-t", config.SESSION, "main-vertical")

    # Resize main pane to be wider
    run("resize-pane", "-t", f"{config.SESSION}:0.0", "-x", "50%")
