"""Iris-specific tmux operations.

This module wraps brain.tmux with Iris-specific functionality:
- God-aware pane management
- Iris session configuration
- Theme and styling
"""
from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass

from . import config

# Import generic tmux operations
from brain import tmux as tmux_ops


# ─────────────────────────────────────────────────────────────────
# God-Aware Pane
# ─────────────────────────────────────────────────────────────────

GOD_NAMES = {
    "apollo", "artemis", "athena", "hermes", "hades", "poseidon",
    "hera", "ares", "hephaestus", "aphrodite", "dionysus", "demeter",
}


@dataclass
class Pane:
    """Represents a tmux pane with god awareness."""
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


# ─────────────────────────────────────────────────────────────────
# Environment
# ─────────────────────────────────────────────────────────────────

def _get_env() -> dict:
    """Get environment with IRIS_DIR set."""
    import os
    env = os.environ.copy()
    env["IRIS_DIR"] = str(config.IRIS_DIR)
    return env


# ─────────────────────────────────────────────────────────────────
# Compatibility wrappers (for existing code)
# ─────────────────────────────────────────────────────────────────

def run(*args, capture=True, check=False) -> subprocess.CompletedProcess:
    """Run a tmux command with Iris environment."""
    return tmux_ops.run(*args, env=_get_env(), capture=capture)


def darken_color(hex_color: str, factor: float = 0.5) -> str:
    """Darken a hex color."""
    return tmux_ops.darken_color(hex_color, factor)


# ─────────────────────────────────────────────────────────────────
# Session Operations
# ─────────────────────────────────────────────────────────────────

def session_exists() -> bool:
    """Check if the Iris session exists."""
    return tmux_ops.session_exists(config.SESSION)


def start_session():
    """Start the Iris tmux session with Claude."""
    if session_exists():
        print("\033[33mIris session already running\033[0m")
        focus_session()
        return

    # Get colors - main pane is a shade too
    border_colors = config.get_border_colors()
    shade_color = config.get_next_shade_color(set())
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

    # Create session
    tmux_ops.create_session(
        session=config.SESSION,
        window_name="Olympus",
        command=claude_cmd,
        config_file=str(config.TMUX_CONF),
        env=_get_env(),
    )

    # Set IRIS_DIR in session environment for keybindings
    tmux_ops.set_environment(config.SESSION, "IRIS_DIR", str(config.IRIS_DIR))

    # Style the session
    tmux_ops.set_option(config.SESSION, "status", "off")
    tmux_ops.set_option(config.SESSION, "pane-border-status", "top")
    tmux_ops.set_option(config.SESSION, "pane-border-lines", "heavy")

    inactive_color = darken_color(border_colors['bg'], 0.4)
    tmux_ops.set_option(config.SESSION, "pane-border-style", f"fg={inactive_color},bg={inactive_color}")
    tmux_ops.set_option(config.SESSION, "pane-active-border-style", f"fg={border_colors['bg']},bg={border_colors['bg']}")
    tmux_ops.set_option(config.SESSION, "pane-border-format", f"#[bg={border_colors['bg']},fg={border_colors['fg']},bold] #{{pane_title}} ")
    tmux_ops.set_option(config.SESSION, "allow-set-title", "off")

    # Style main pane as a shade
    # Get the pane ID of the first pane
    panes = tmux_ops.list_panes(config.SESSION)
    if panes:
        main_pane = panes[0].pane_id
        tmux_ops.set_pane_style(main_pane, color_bg, color_fg)
        tmux_ops.set_pane_title(main_pane, f"{color_name}: {task}")

    print(f"\033[32mIris session started ({color_name})\033[0m")
    focus_session()


def focus_session():
    """Focus or open the Iris session in a terminal."""
    import platform

    if platform.system() == "Linux":
        # Check if already attached in a ghostty window
        result = subprocess.run(
            ["pgrep", "-f", f"ghostty.*tmux attach.*{config.SESSION}"],
            capture_output=True,
        )

        if result.returncode == 0:
            # Try to focus existing window (Hyprland)
            subprocess.run(
                ["hyprctl", "dispatch", "focuswindow", "class:com.mitchellh.ghostty"],
                capture_output=True,
            )
            return

    # Try ghostty first, fallback to plain tmux attach
    if shutil.which("ghostty"):
        subprocess.Popen(
            ["ghostty", "-e", "tmux", "-f", str(config.TMUX_CONF), "attach", "-t", config.SESSION],
            env=_get_env(),
        )
    else:
        # Fallback: just attach in current terminal
        subprocess.run(
            ["tmux", "-f", str(config.TMUX_CONF), "attach", "-t", config.SESSION],
            env=_get_env(),
        )


def kill_session():
    """Kill the Iris tmux session."""
    if not session_exists():
        print("\033[33mIris session not running\033[0m")
        return
    tmux_ops.kill_session(config.SESSION)
    print("\033[32mIris session stopped\033[0m")


# ─────────────────────────────────────────────────────────────────
# Pane Operations (Iris-specific wrappers)
# ─────────────────────────────────────────────────────────────────

def list_panes() -> list[Pane]:
    """List all panes in the Iris session as god-aware Pane objects."""
    if not session_exists():
        return []

    raw_panes = tmux_ops.list_panes(config.SESSION)
    return [Pane(pane_id=p.pane_id, title=p.title) for p in raw_panes]


def create_pane(command: str) -> str | None:
    """Create a new pane in the Iris session."""
    if not session_exists():
        return None
    return tmux_ops.create_pane(config.SESSION, command, horizontal=True, env=_get_env())


def kill_pane(pane_id: str) -> bool:
    """Kill a pane by ID."""
    return tmux_ops.kill_pane(pane_id)


def set_pane_title(pane_id: str, title: str):
    """Set a pane's title."""
    tmux_ops.set_pane_title(pane_id, title)


def set_pane_style(pane_id: str, bg_color: str, fg_color: str = "#ffffff"):
    """Set a pane's background and foreground colors."""
    tmux_ops.set_pane_style(pane_id, bg_color, fg_color)


def send_keys(pane_id: str, keys: str, enter: bool = True):
    """Send keys to a pane."""
    tmux_ops.send_keys(pane_id, keys, enter)


def capture_pane(pane_id: str, lines: int = 30) -> str:
    """Capture output from a pane."""
    return tmux_ops.capture_pane(pane_id, lines)


def pipe_pane(pane_id: str, command: str | None):
    """Start or stop piping pane output to a command."""
    tmux_ops.pipe_pane(pane_id, command)


def apply_layout():
    """Apply grid layout to the Iris session."""
    if not session_exists():
        return
    panes = list_panes()
    pane_ids = [p.pane_id for p in sorted(panes, key=lambda p: int(p.pane_id[1:]))]
    tmux_ops.apply_grid_layout(config.SESSION, pane_ids)
