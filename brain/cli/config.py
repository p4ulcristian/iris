"""Configuration loading and path resolution."""

import json
import os
import random
from pathlib import Path
from functools import lru_cache


# Derive IRIS_DIR from this file's location
IRIS_DIR = Path(__file__).parent.parent.parent.resolve()
BRAIN_DIR = IRIS_DIR / "brain"
CONFIG_DIR = IRIS_DIR / "config"
SHADOWS_DIR = IRIS_DIR / "shadows"
SETTINGS_FILE = CONFIG_DIR / "settings.json"

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


@lru_cache
def load_settings() -> dict:
    """Load settings from config/settings.json."""
    if not SETTINGS_FILE.exists():
        return {}
    with open(SETTINGS_FILE) as f:
        return json.load(f)


def get_projects() -> dict[str, Path]:
    """Get project paths from config, expanding $HOME."""
    settings = load_settings()
    projects = {}
    for name, path_str in settings.get("projects", {}).items():
        # Expand $HOME
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


def get_shade_colors() -> list[dict]:
    """Get shade color definitions."""
    settings = load_settings()
    return settings.get("colors", {}).get("shades", [])


def get_iris_colors() -> dict:
    """Get iris color scheme."""
    settings = load_settings()
    return settings.get("colors", {}).get("iris", {"bg": "#1f1a28", "header": "#c9b1d4"})


def get_border_colors() -> dict:
    """Get border color scheme."""
    settings = load_settings()
    return settings.get("colors", {}).get("border", {"bg": "#c9b1d4", "fg": "#1f1a28"})


def get_next_shade_color(used_names: set[str]) -> dict:
    """Get the next available shade color."""
    colors = get_shade_colors()
    available = [c for c in colors if c["name"] not in used_names]

    if available:
        return random.choice(available)
    else:
        # All used, pick random
        return random.choice(colors) if colors else {"name": "Gray", "bg": "#1a1a1a", "header": "#808080"}


def get_shade_prompt() -> str:
    """Get the shade prompt template."""
    settings = load_settings()
    return settings.get("prompts", {}).get("shade", "You are {{COLOR_NAME}}, a shade. Task: {{TASK}}")


def get_iris_prompt() -> str:
    """Get the iris prompt."""
    settings = load_settings()
    return settings.get("prompts", {}).get("iris", "You are Iris, the master orchestrator.")
