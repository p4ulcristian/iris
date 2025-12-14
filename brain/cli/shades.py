"""Shade management - spawn, kill, list, send, peek."""

import json
import secrets
from datetime import datetime
from pathlib import Path

from . import config
from . import tmux


def _get_used_colors() -> set[str]:
    """Get shade color names currently in use."""
    used = set()
    for pane in tmux.list_panes():
        info = pane.shade_info
        if info:
            used.add(info[0])  # name
    return used


def _find_shade(name: str) -> tuple[str, str, str] | None:
    """Find a shade by name (case insensitive). Returns (pane_id, name, uuid)."""
    search = name.lower()
    for pane in tmux.list_panes():
        info = pane.shade_info
        if info and info[0].lower() == search:
            return pane.pane_id, info[0], info[1]
    return None


def spawn(task: str, project: str | None = None, model: str | None = None, voice: str = "indian") -> dict | None:
    """Spawn a new shade with a task."""
    if not tmux.session_exists():
        print("\033[31mIris not running. Start with: iris\033[0m")
        return None

    config.ensure_dirs()

    # Get color
    used = _get_used_colors()
    color = config.get_next_shade_color(used)
    color_name = color["name"]
    color_bg = color.get("bg", "#1a1a1a")

    # Generate UUID
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    rand_hex = secrets.token_hex(2)
    worker_uuid = f"{color_name.lower()}-{timestamp}-{rand_hex}"

    # Resolve project
    project_dir = config.resolve_project(project) if project else None

    # Build init message from template
    prompt_template = config.get_shade_prompt()
    init_msg = prompt_template.replace("{{COLOR_NAME}}", color_name)
    init_msg = init_msg.replace("{{WORKER_UUID}}", worker_uuid)
    init_msg = init_msg.replace("{{VOICE}}", voice)
    init_msg = init_msg.replace("{{TASK}}", task)

    # Escape for shell
    escaped_msg = init_msg.replace("'", "'\"'\"'")

    # Build claude command
    model_flag = f"--model {model}" if model else ""
    project_flag = f"--add-dir '{project_dir}'" if project_dir else ""

    claude_cmd = (
        f"cd '{config.IRIS_DIR}' && "
        f"SHADE_UUID='{worker_uuid}' SHADE_NAME='{color_name}' "
        f"claude {model_flag} --dangerously-skip-permissions {project_flag} -- '{escaped_msg}'"
    )

    # Create shadows folder
    shadow_dir = config.SHADOWS_DIR / worker_uuid
    shadow_dir.mkdir(parents=True, exist_ok=True)
    (shadow_dir / "task.txt").write_text(task)
    (shadow_dir / "name.txt").write_text(color_name)
    (shadow_dir / "spawned.txt").write_text(datetime.now().isoformat())
    (shadow_dir / "status.txt").write_text("laboring")
    if project:
        (shadow_dir / "project.txt").write_text(project)

    # Create pane
    pane_id = tmux.create_pane(claude_cmd)
    if not pane_id:
        return None

    # Set pane metadata
    title_meta = f"{color_name}|{worker_uuid}|{project or 'none'}"
    tmux.set_pane_title(pane_id, title_meta)
    tmux.set_pane_style(pane_id, color_bg)

    # Start logging
    tmux.pipe_pane(pane_id, f"cat >> '{shadow_dir}/output.log'")

    # Apply layout
    tmux.apply_layout()

    return {
        "name": color_name,
        "uuid": worker_uuid,
        "pane_id": pane_id,
        "project": project,
    }


def kill(name: str) -> bool:
    """Kill a shade by name."""
    shade = _find_shade(name)
    if not shade:
        return False

    pane_id, shade_name, uuid = shade

    # Don't kill master pane
    if pane_id == "%0":
        print("\033[31mCannot kill master pane\033[0m")
        return False

    # Record outcome
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
    """Kill all shades. Returns count killed."""
    count = 0
    for pane in tmux.list_panes():
        if pane.pane_id == "%0":  # Skip master
            continue

        info = pane.shade_info
        if not info:
            continue

        name, uuid, project = info

        # Record outcome
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


def send(name: str, message: str) -> bool:
    """Send a message to a shade."""
    shade = _find_shade(name)
    if not shade:
        return False

    pane_id, _, _ = shade
    tmux.send_keys(pane_id, message)
    return True


def peek(name: str, lines: int = 30) -> str | None:
    """Get recent output from a shade."""
    shade = _find_shade(name)
    if not shade:
        return None

    pane_id, _, _ = shade
    return tmux.capture_pane(pane_id, lines)


def list_shades(show_all: bool = False, json_output: bool = False):
    """List active shades and optionally history."""
    active = _get_active_shades()

    if json_output:
        if show_all:
            history = _get_history(set(active.keys()))
            print(json.dumps({"active": active, "history": history}, indent=2))
        else:
            print(json.dumps(active, indent=2))
        return

    # Human-readable output
    print("=== Active Shades ===")
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


def _get_active_shades() -> dict:
    """Get all active shades as a dict keyed by UUID."""
    result = {}

    for pane in tmux.list_panes():
        info = pane.shade_info
        if not info:
            continue

        name, uuid, project = info

        # Read additional info from shadows folder
        shadow_dir = config.SHADOWS_DIR / uuid
        task = ""
        spawned = ""
        status = "laboring"
        current_task = ""

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

        result[uuid] = {
            "uuid": uuid,
            "pane_id": pane.pane_id,
            "name": name,
            "task": task,
            "current_task": current_task,
            "project": project if project != "none" else "",
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
