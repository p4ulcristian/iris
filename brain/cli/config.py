"""Configuration loading and path resolution."""

import json
import os
import random
from pathlib import Path


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


def load_settings() -> dict:
    """Load settings from config/settings.json (fresh read, no cache)."""
    if not SETTINGS_FILE.exists():
        return {}
    with open(SETTINGS_FILE) as f:
        return json.load(f)


def save_settings(settings: dict):
    """Save settings to config/settings.json."""
    with open(SETTINGS_FILE, "w") as f:
        json.dump(settings, f, indent=2)


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


def get_current_theme() -> str:
    """Get the current theme name."""
    settings = load_settings()
    return settings.get("colors", {}).get("current_theme", "atom-one-dark")


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


def get_shade_colors() -> list[dict]:
    """Get shade color definitions from current theme."""
    theme = get_theme()
    return theme.get("shades", [])


def get_iris_colors() -> dict:
    """Get iris color scheme."""
    settings = load_settings()
    return settings.get("colors", {}).get("iris", {"bg": "#1f1a28", "header": "#c9b1d4"})


def get_border_colors() -> dict:
    """Get border color scheme from current theme."""
    theme = get_theme()
    if "border" in theme:
        return theme["border"]
    # Fallback to global border
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
        return random.choice(colors) if colors else {"name": "Gray", "bg": "#1a1a1a", "fg": "#808080"}


def get_god_config(name: str) -> dict:
    """Get god configuration (voice, traits) by name."""
    settings = load_settings()
    gods = settings.get("gods", {})
    return gods.get(name, {"voice": "emma", "traits": ""})


def get_god_prompt() -> str:
    """Get the god prompt template."""
    settings = load_settings()
    return settings.get("prompts", {}).get("god", "You are {{GOD_NAME}}, a god. Task: {{TASK}}")
