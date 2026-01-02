"""Spawn - summon gods in Iris v2 Electron app."""

import json
import os
import random
from datetime import datetime
from pathlib import Path

import yaml

from brain.skills.ws import spawn_god as ws_spawn_god


def get_iris_root() -> Path:
    """Get the iris project root directory."""
    return Path(__file__).parent.parent.parent.parent


def load_gods() -> dict[str, dict[str, str]]:
    """Load config/gods.json - the god registry."""
    root = get_iris_root()
    gods_path = root / "config" / "gods.json"

    if not gods_path.exists():
        return {}

    with open(gods_path) as f:
        return json.load(f)


def load_settings() -> dict:
    """Load config/settings.yaml."""
    root = get_iris_root()
    settings_path = root / "config" / "settings.yaml"

    if not settings_path.exists():
        return {}

    with open(settings_path) as f:
        return yaml.safe_load(f) or {}


def list_gods() -> list[str]:
    """List all available god names."""
    return list(load_gods().keys())


def load_god(name: str) -> dict[str, str]:
    """Load a god's configuration."""
    gods = load_gods()
    name_lower = name.lower()

    if name_lower in gods:
        return gods[name_lower]

    # Search by voice
    for god_name, config in gods.items():
        if config.get("voice", "").lower() == name_lower:
            return config

    return {}


def get_god_color(god_name: str, variant: str = "fg") -> str:
    """Get the color hex for a god."""
    god = load_god(god_name)
    color_name = god.get("color", "cyan")

    settings = load_settings()
    colors = settings.get("colors", {})
    theme_name = colors.get("current_theme", "catppuccin")
    themes = colors.get("themes", {})
    theme = themes.get(theme_name, {})

    color_entry = theme.get(color_name.lower(), {})
    if isinstance(color_entry, dict):
        return color_entry.get(variant, "#ffffff")

    return "#ffffff"


def get_project_path(project_name: str) -> Path | None:
    """Get the path for a project alias."""
    settings = load_settings()
    projects = settings.get("projects", {})

    name_lower = project_name.lower()
    for key, path in projects.items():
        if key.lower() == name_lower or key.lower().startswith(name_lower):
            expanded = os.path.expandvars(path)
            return Path(expanded).expanduser()

    return None


def generate_uuid(god_name: str) -> str:
    """Generate a unique ID for a god instance."""
    now = datetime.now()
    timestamp = now.strftime("%Y%m%d-%H%M%S")
    hex_suffix = f"{random.randint(0, 0xFFFF):04x}"
    return f"{god_name}-{timestamp}-{hex_suffix}"


def create_shadow(uuid: str, god_name: str, task: str, project: str | None = None) -> Path:
    """Create the shadow directory for a god instance."""
    shadow_dir = get_iris_root() / "shadows" / uuid
    shadow_dir.mkdir(parents=True, exist_ok=True)

    (shadow_dir / "name.txt").write_text(god_name.capitalize())
    (shadow_dir / "task.txt").write_text(task)
    (shadow_dir / "status.txt").write_text("working")
    (shadow_dir / "spawned.txt").write_text(datetime.now().isoformat())

    if project:
        (shadow_dir / "project.txt").write_text(project)

    return shadow_dir


def spawn_god(
    task: str,
    god_name: str | None = None,
    project: str | None = None,
) -> str | None:
    """Spawn a new god in Iris v2.

    Args:
        task: The task for the god
        god_name: God name (random if not specified)
        project: Project context (optional)

    Returns:
        UUID of spawned god, or None if failed
    """
    # Pick a god if not specified
    if not god_name:
        available = list_gods()
        god_name = random.choice(available)

    god_name = god_name.lower()

    # Validate god exists
    god_config = load_god(god_name)
    if not god_config:
        print(f"\033[31mUnknown god: {god_name}\033[0m")
        return None

    # Generate UUID and create shadow
    uuid = generate_uuid(god_name)
    create_shadow(uuid, god_name, task, project)

    # Spawn via WebSocket - server handles color, command, everything
    success = ws_spawn_god(god_name.capitalize(), task)

    if not success:
        print(f"\033[31mFailed to spawn {god_name.capitalize()} - is Iris v2 running?\033[0m")
        return None

    print(f"\033[32mSpawned {god_name.capitalize()}\033[0m ({uuid})")
    return uuid
