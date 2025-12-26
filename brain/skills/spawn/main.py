"""Spawn - summon gods in Iris v2 Electron app."""

import os
import random
from datetime import datetime
from pathlib import Path

import yaml

from brain.skills.ws import spawn_terminal


def get_iris_root() -> Path:
    """Get the iris project root directory."""
    return Path(__file__).parent.parent.parent.parent


def load_pantheon() -> dict[str, dict[str, str]]:
    """Load prompts/pantheon.yaml - the god configurations."""
    root = get_iris_root()
    pantheon_path = root / "prompts" / "pantheon.yaml"

    if not pantheon_path.exists():
        return {}

    with open(pantheon_path) as f:
        return yaml.safe_load(f) or {}


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
    return list(load_pantheon().keys())


def load_god(name: str) -> dict[str, str]:
    """Load a god's configuration."""
    pantheon = load_pantheon()
    name_lower = name.lower()

    if name_lower in pantheon:
        return pantheon[name_lower]

    # Search by voice
    for god_name, config in pantheon.items():
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
    (shadow_dir / "status.txt").write_text("laboring")
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

    # Get god's color and voice
    fg_color = get_god_color(god_name, "fg")
    voice = god_config.get("voice", god_name)

    # Build the claude command
    prompt = f"You are {god_name.capitalize()}. Voice: {voice}.\\n\\nAnnounce yourself and ask what Paul needs."
    cmd = f'claude --dangerously-skip-permissions -p "{prompt}"'

    # Determine working directory
    cwd = str(get_iris_root())
    if project:
        project_path = get_project_path(project)
        if project_path and project_path.exists():
            cwd = str(project_path)

    # Build terminal name
    name = god_name.capitalize()

    # Spawn via WebSocket
    success = spawn_terminal(
        command=cmd,
        name=name,
        color=fg_color,
        cwd=cwd
    )

    if not success:
        print(f"\033[31mFailed to spawn {god_name.capitalize()} - is Iris v2 running?\033[0m")
        return None

    print(f"\033[32mSpawned {god_name.capitalize()}\033[0m ({uuid})")
    return uuid
