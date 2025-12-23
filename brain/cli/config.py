"""Configuration loading and path resolution."""
from __future__ import annotations

import os
import random
from pathlib import Path

import yaml


# Derive IRIS_DIR from this file's location
IRIS_DIR = Path(__file__).parent.parent.parent.resolve()
BRAIN_DIR = IRIS_DIR / "brain"
CONFIG_DIR = IRIS_DIR / "config"
SHADOWS_DIR = IRIS_DIR / "shadows"
PROMPTS_DIR = IRIS_DIR / "prompts"

SETTINGS_FILE = CONFIG_DIR / "settings.yaml"
PANTHEON_FILE = PROMPTS_DIR / "pantheon.yaml"
TMUX_CONF = CONFIG_DIR / "tmux.conf"

# Runtime directories
PID_DIR = Path("/tmp/iris")
LOG_DIR = Path("/tmp/iris")

# Tmux session name
SESSION = "iris"


def ensure_dirs():
    """Ensure runtime directories exist."""
    PID_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    SHADOWS_DIR.mkdir(parents=True, exist_ok=True)


def load_settings() -> dict:
    """Load settings from YAML (fresh read, no cache)."""
    if not SETTINGS_FILE.exists():
        return {}
    with open(SETTINGS_FILE) as f:
        return yaml.safe_load(f) or {}


def save_settings(settings: dict):
    """Save settings to YAML."""
    with open(SETTINGS_FILE, "w") as f:
        yaml.dump(settings, f, default_flow_style=False, sort_keys=False)


def load_pantheon() -> dict:
    """Load all gods from pantheon.yaml."""
    if not PANTHEON_FILE.exists():
        return {}
    with open(PANTHEON_FILE) as f:
        return yaml.safe_load(f) or {}


def load_god(name: str) -> dict:
    """Load a single god's config from pantheon."""
    pantheon = load_pantheon()
    return pantheon.get(name.lower(), {
        "voice": "emma",
        "color": "gray",
        "domain": "",
        "traits": ""
    })


def get_god_names() -> list[str]:
    """Get list of all god names."""
    return list(load_pantheon().keys())


def get_projects() -> dict[str, Path]:
    """Get project paths from config, expanding $HOME."""
    settings = load_settings()
    projects = {}
    for name, path_str in settings.get("projects", {}).items():
        expanded = path_str.replace("$HOME", os.environ.get("HOME", ""))
        projects[name] = Path(expanded)
    return projects


def resolve_project(name: str) -> Path | None:
    """Resolve a project name to its directory path."""
    if not name:
        return None

    normalized = name.lower().replace(" ", "")

    # Special case: iris itself
    if normalized == "iris":
        return IRIS_DIR

    # Check config
    projects = get_projects()
    if normalized in projects:
        path = projects[normalized]
        if path.exists():
            return path

    # Direct path
    direct = Path(name)
    if direct.is_dir():
        return direct.resolve()

    return None


def get_current_theme() -> str:
    """Get the current theme name."""
    settings = load_settings()
    return settings.get("colors", {}).get("current_theme", "catppuccin")


def get_theme_names() -> list[str]:
    """Get list of available theme names."""
    settings = load_settings()
    themes = settings.get("colors", {}).get("themes", {})
    return list(themes.keys())


def set_current_theme(theme_name: str) -> bool:
    """Set the current theme. Returns True if successful."""
    settings = load_settings()
    themes = settings.get("colors", {}).get("themes", {})

    if theme_name not in themes:
        return False

    if "colors" not in settings:
        settings["colors"] = {}
    settings["colors"]["current_theme"] = theme_name
    save_settings(settings)
    return True


def get_theme(theme_name: str = None) -> dict:
    """Get a theme by name, or current theme if not specified."""
    settings = load_settings()
    if theme_name is None:
        theme_name = get_current_theme()

    themes = settings.get("colors", {}).get("themes", {})
    return themes.get(theme_name, {})


def get_color_hex(color_name: str) -> dict:
    """Get hex values for a color name from current theme."""
    theme = get_theme()
    return theme.get(color_name, {"bg": "#1a1a1a", "fg": "#808080"})


def get_border_colors() -> dict:
    """Get border color scheme from current theme."""
    theme = get_theme()
    return theme.get("border", {"bg": "#c9b1d4", "fg": "#1f1a28"})


def get_next_god(used_names: set[str]) -> str:
    """Get the next available god name."""
    all_gods = get_god_names()
    available = [n for n in all_gods if n.capitalize() not in used_names]

    if available:
        return random.choice(available)
    else:
        return random.choice(all_gods) if all_gods else "apollo"
