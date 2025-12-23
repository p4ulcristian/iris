"""God management - summon, banish, list, send, peek."""
from __future__ import annotations

import json
import os
import secrets
from datetime import datetime
from pathlib import Path

from . import config
from . import tmux


def _get_used_names() -> set[str]:
    """Get god names currently in use."""
    used = set()
    for pane in tmux.list_panes():
        if pane.god_name:
            used.add(pane.god_name)
    return used


def _find_god(name: str) -> tuple[str, str] | None:
    """Find a god by name (case insensitive). Returns (pane_id, name)."""
    search = name.lower()
    for pane in tmux.list_panes():
        if pane.god_name and pane.god_name.lower() == search:
            return pane.pane_id, pane.god_name
    return None


def _find_uuid_by_pane(pane_id: str) -> str | None:
    """Find god UUID by searching shadow folders for matching pane_id."""
    if not config.SHADOWS_DIR.exists():
        return None
    for shadow_dir in config.SHADOWS_DIR.iterdir():
        if not shadow_dir.is_dir():
            continue
        pane_file = shadow_dir / "pane_id.txt"
        died_file = shadow_dir / "died.txt"
        if pane_file.exists() and not died_file.exists():
            if pane_file.read_text().strip() == pane_id:
                return shadow_dir.name
    return None


def _find_uuid_by_name(name: str) -> str | None:
    """Find god UUID by searching shadow folders for matching name (active only)."""
    if not config.SHADOWS_DIR.exists():
        return None
    search = name.lower()
    for shadow_dir in config.SHADOWS_DIR.iterdir():
        if not shadow_dir.is_dir():
            continue
        name_file = shadow_dir / "name.txt"
        died_file = shadow_dir / "died.txt"
        if name_file.exists() and not died_file.exists():
            if name_file.read_text().strip().lower() == search:
                return shadow_dir.name
    return None


def spawn(task: str, project: str | None = None, model: str | None = None, voice: str | None = None, god_name: str | None = None) -> dict | None:
    """Summon a new god with a task."""
    if not tmux.session_exists():
        print("\033[31mIris not running. Start with: iris\033[0m")
        return None

    config.ensure_dirs()

    # Get god name
    used = _get_used_names()
    if god_name:
        god_name = god_name.capitalize()
    else:
        god_name = config.get_next_god(used).capitalize()

    # Load god data from pantheon
    god_data = config.load_god(god_name)
    voice = voice or god_data.get("voice", "emma")
    color_name = god_data.get("color", "gray")
    domain = god_data.get("domain", "")
    traits = god_data.get("traits", "")

    # Get hex colors from theme
    color_hex = config.get_color_hex(color_name)
    color_bg = color_hex.get("bg", "#1a1a1a")
    color_fg = color_hex.get("fg", "#ffffff")

    # Generate UUID
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    rand_hex = secrets.token_hex(2)
    god_uuid = f"{god_name.lower()}-{timestamp}-{rand_hex}"

    # Resolve project
    project_dir = config.resolve_project(project) if project else None

    # Create shadows folder
    shadow_dir = config.SHADOWS_DIR / god_uuid
    shadow_dir.mkdir(parents=True, exist_ok=True)

    # Write identity.md for the god to read
    spawned_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    identity_content = f"""# Identity

| Key | Value |
|-----|-------|
| God | {god_name} |
| UUID | {god_uuid} |
| Voice | {voice} |
| Color | {color_name} |
| Domain | {domain} |
| Task | {task} |
| Spawned | {spawned_time} |

## Traits

{traits}
"""
    (shadow_dir / "identity.md").write_text(identity_content)
    (shadow_dir / "task.txt").write_text(task)
    (shadow_dir / "name.txt").write_text(god_name)
    (shadow_dir / "spawned.txt").write_text(datetime.now().isoformat())
    (shadow_dir / "status.txt").write_text("laboring")
    if project:
        (shadow_dir / "project.txt").write_text(project)

    # Simple init message - context comes from @imports in CLAUDE.md
    init_msg = "Start."

    # Build claude command
    model_flag = f"--model {model}" if model else ""
    project_flag = f"--add-dir '{project_dir}'" if project_dir else ""

    claude_cmd = (
        f"cd '{config.IRIS_DIR}' && "
        f"GOD_UUID='{god_uuid}' GOD_NAME='{god_name}' "
        f"claude {model_flag} --dangerously-skip-permissions {project_flag} -- '{init_msg}'"
    )

    # Create pane
    pane_id = tmux.create_pane(claude_cmd)
    if not pane_id:
        return None

    # Store pane_id for UUID lookup
    (shadow_dir / "pane_id.txt").write_text(pane_id)

    # Set pane title: "Name: Task" (truncate task if too long)
    task_display = task[:50] + "..." if len(task) > 50 else task
    title = f"{god_name}: {task_display}"
    tmux.set_pane_title(pane_id, title)
    tmux.set_pane_style(pane_id, color_bg, color_fg)

    # Start logging
    tmux.pipe_pane(pane_id, f"cat >> '{shadow_dir}/output.log'")

    # Apply layout
    tmux.apply_layout()

    return {
        "name": god_name,
        "uuid": god_uuid,
        "pane_id": pane_id,
        "project": project,
    }


def kill(name: str) -> bool:
    """Banish a god by name."""
    god = _find_god(name)
    if not god:
        return False

    pane_id, god_name = god

    # Don't kill master pane
    if pane_id == "%0":
        print("\033[31mCannot kill master pane\033[0m")
        return False

    # Find UUID and record outcome
    uuid = _find_uuid_by_pane(pane_id)
    if uuid:
        shadow_dir = config.SHADOWS_DIR / uuid
        if shadow_dir.exists():
            (shadow_dir / "outcome.txt").write_text("killed")
            (shadow_dir / "died.txt").write_text(datetime.now().isoformat())

    # Stop logging and kill
    tmux.pipe_pane(pane_id, None)
    tmux.kill_pane(pane_id)
    tmux.apply_layout()

    return True


def kill_all() -> int:
    """Banish all gods. Returns count banished."""
    count = 0
    for pane in tmux.list_panes():
        if pane.pane_id == "%0":  # Skip master
            continue

        if not pane.is_god:
            continue

        # Find UUID and record outcome
        uuid = _find_uuid_by_pane(pane.pane_id)
        if uuid:
            shadow_dir = config.SHADOWS_DIR / uuid
            if shadow_dir.exists():
                (shadow_dir / "outcome.txt").write_text("killed")
                (shadow_dir / "died.txt").write_text(datetime.now().isoformat())

        # Stop logging and kill
        tmux.pipe_pane(pane.pane_id, None)
        tmux.kill_pane(pane.pane_id)
        count += 1

    if count:
        tmux.apply_layout()

    return count


def quit_self(status: str = "fulfilled") -> bool:
    """Self-terminate (for gods to call on themselves)."""
    uuid = os.environ.get("GOD_UUID")
    if not uuid:
        return False

    # Find our pane by UUID (from shadow folder pane_id.txt)
    shadow_dir = config.SHADOWS_DIR / uuid
    if not shadow_dir.exists():
        return False

    pane_file = shadow_dir / "pane_id.txt"
    if not pane_file.exists():
        return False

    pane_id = pane_file.read_text().strip()

    # Record outcome
    (shadow_dir / "status.txt").write_text(status)
    (shadow_dir / "outcome.txt").write_text(status)
    (shadow_dir / "died.txt").write_text(datetime.now().isoformat())

    # Stop logging and kill
    tmux.pipe_pane(pane_id, None)
    tmux.kill_pane(pane_id)
    tmux.apply_layout()
    return True


def send(name: str, message: str) -> bool:
    """Send a message to a god."""
    god = _find_god(name)
    if not god:
        return False

    pane_id, _ = god
    tmux.send_keys(pane_id, message)
    return True


def peek(name: str, lines: int = 30) -> str | None:
    """Get recent output from a god."""
    god = _find_god(name)
    if not god:
        return None

    pane_id, _ = god
    return tmux.capture_pane(pane_id, lines)


def list_gods(show_all: bool = False, json_output: bool = False):
    """List active gods and optionally history."""
    active = _get_active_gods()

    if json_output:
        if show_all:
            history = _get_history(set(active.keys()))
            print(json.dumps({"active": active, "history": history}, indent=2))
        else:
            print(json.dumps(active, indent=2))
        return

    # Human-readable output
    print("=== Active Gods ===")
    if not active:
        print("  (none)")
    else:
        for uuid, info in active.items():
            icon = _status_icon(info.get("status", "laboring"))
            print(f"{icon} {info['name']} ({info['pane_id']})")
            print(f"  Task: {info.get('task', '—')}")
            current = info.get("current_task")
            if current:
                print(f"  Current: {current}")
            print()

    if show_all:
        print("=== History ===")
        history = _get_history(set(active.keys()))
        if not history:
            print("  (none)")
        else:
            for item in history:
                print(f"{item['name']} - {item.get('outcome', 'unknown')}")
                print(f"  Task: {item.get('task', '—')}")
                print()


def _status_icon(status: str) -> str:
    """Get status icon for display."""
    icons = {
        "laboring": "▶",
        "working": "▶",
        "busy": "▶",
        "dormant": "◉",
        "idle": "◉",
        "fulfilled": "✦",
        "done": "✦",
        "scattered": "⚡",
        "crashed": "⚡",
    }
    return icons.get(status, "▶")


def _get_active_gods() -> dict:
    """Get all active gods as a dict keyed by UUID."""
    result = {}

    for pane in tmux.list_panes():
        if not pane.is_god:
            continue

        name = pane.god_name
        uuid = _find_uuid_by_pane(pane.pane_id)

        if not uuid:
            continue

        # Read additional info from shadows folder
        shadow_dir = config.SHADOWS_DIR / uuid
        task = ""
        spawned = ""
        status = "laboring"
        current_task = ""
        project = ""

        if shadow_dir.exists():
            task_file = shadow_dir / "task.txt"
            if task_file.exists():
                task = task_file.read_text().strip()

            spawned_file = shadow_dir / "spawned.txt"
            if spawned_file.exists():
                spawned = spawned_file.read_text().strip()

            status_file = shadow_dir / "status.txt"
            if status_file.exists():
                status = status_file.read_text().strip()

            current_file = shadow_dir / "current_task.txt"
            if current_file.exists():
                current_task = current_file.read_text().strip()

            project_file = shadow_dir / "project.txt"
            if project_file.exists():
                project = project_file.read_text().strip()

        result[uuid] = {
            "uuid": uuid,
            "pane_id": pane.pane_id,
            "name": name,
            "task": task,
            "current_task": current_task,
            "project": project,
            "spawned_at": spawned,
            "status": status,
            "status_icon": _status_icon(status),
        }

    return result


def _get_history(active_uuids: set[str]) -> list:
    """Get history from shadows folders (non-active)."""
    result = []

    if not config.SHADOWS_DIR.exists():
        return result

    for shadow_dir in config.SHADOWS_DIR.iterdir():
        if not shadow_dir.is_dir():
            continue

        uuid = shadow_dir.name
        if uuid in active_uuids:
            continue

        name = ""
        task = ""
        project = ""
        spawned = ""
        outcome = "unknown"

        name_file = shadow_dir / "name.txt"
        if name_file.exists():
            name = name_file.read_text().strip()

        task_file = shadow_dir / "task.txt"
        if task_file.exists():
            task = task_file.read_text().strip()

        project_file = shadow_dir / "project.txt"
        if project_file.exists():
            project = project_file.read_text().strip()

        spawned_file = shadow_dir / "spawned.txt"
        if spawned_file.exists():
            spawned = spawned_file.read_text().strip()

        outcome_file = shadow_dir / "outcome.txt"
        if outcome_file.exists():
            outcome = outcome_file.read_text().strip()

        result.append({
            "uuid": uuid,
            "name": name,
            "task": task,
            "project": project,
            "spawned_at": spawned,
            "outcome": outcome,
        })

    return result
