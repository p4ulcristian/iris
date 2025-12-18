"""Iris CLI - Python-based orchestration for Iris."""

import argparse
import grp
import os
import subprocess
import sys
from pathlib import Path

from . import config
from . import tmux
from . import shades
from . import servers


def check_input_group() -> bool:
    """Check if user is in the input group (needed for CapsLock detection)."""
    try:
        user_groups = os.getgroups()
        input_gid = grp.getgrnam('input').gr_gid
        return input_gid in user_groups
    except KeyError:
        return False


def fix_input_group() -> bool:
    """Prompt user to add themselves to input group."""
    username = os.environ.get('USER', 'user')
    print(f"\033[33mWarning: You're not in the 'input' group.\033[0m")
    print("CapsLock detection requires access to /dev/input/")
    print()
    response = input(f"Run 'sudo usermod -aG input {username}'? [y/N] ").strip().lower()

    if response == 'y':
        result = subprocess.run(
            ['sudo', 'usermod', '-aG', 'input', username],
            capture_output=False
        )
        if result.returncode == 0:
            print()
            print("\033[32mAdded to input group!\033[0m")
            print("\033[33mYou need to log out and back in for this to take effect.\033[0m")
            return True
        else:
            print("\033[31mFailed to add to input group\033[0m")
            return False
    return False


def main():
    parser = argparse.ArgumentParser(
        prog="iris",
        description="Iris - shade orchestration and voice services",
    )
    subparsers = parser.add_subparsers(dest="command")

    # iris (no command) - start everything
    # iris start [components...]
    start_p = subparsers.add_parser("start", help="Start components")
    start_p.add_argument("components", nargs="*", help="Components to start (default: all)")

    # iris stop [components...]
    stop_p = subparsers.add_parser("stop", help="Stop components")
    stop_p.add_argument("components", nargs="*", help="Components to stop (default: servers only)")
    stop_p.add_argument("--all", action="store_true", help="Stop everything including CLI")

    # iris spawn [--project NAME] [--model MODEL] [--voice VOICE] [--quiet] TASK
    spawn_p = subparsers.add_parser("spawn", help="Spawn a new shade")
    spawn_p.add_argument("--project", "-p", help="Project context")
    spawn_p.add_argument("--model", "-m", help="Model to use")
    spawn_p.add_argument("--voice", "-v", default="emma", help="Voice for shade (default: emma)")
    spawn_p.add_argument("--quiet", "-q", action="store_true", help="Suppress output (for keybindings)")
    spawn_p.add_argument("task", nargs="+", help="Task description")

    # iris kill NAME|all
    kill_p = subparsers.add_parser("kill", help="Kill a shade")
    kill_p.add_argument("name", help="Shade name or 'all'")

    # iris list [--all] [--json]
    list_p = subparsers.add_parser("list", help="List shades")
    list_p.add_argument("--all", action="store_true", help="Include history")
    list_p.add_argument("--json", action="store_true", help="JSON output")

    # iris send NAME MESSAGE
    send_p = subparsers.add_parser("send", help="Send message to shade")
    send_p.add_argument("name", help="Shade name")
    send_p.add_argument("message", nargs="+", help="Message to send")

    # iris peek NAME [LINES]
    peek_p = subparsers.add_parser("peek", help="View shade output")
    peek_p.add_argument("name", help="Shade name")
    peek_p.add_argument("lines", nargs="?", type=int, default=30, help="Lines to show")

    # iris logs [COMPONENT...]
    logs_p = subparsers.add_parser("logs", help="Tail server logs")
    logs_p.add_argument("components", nargs="*", help="Components to tail")

    # iris status
    subparsers.add_parser("status", help="Show system status")

    # iris quit [--status STATUS] - for shades to self-terminate
    quit_p = subparsers.add_parser("quit", help="Self-terminate (for shades)")
    quit_p.add_argument("--status", "-s", default="fulfilled", help="Final status (default: fulfilled)")

    args = parser.parse_args()

    # No command = start all
    if args.command is None:
        return cmd_start([])

    # Dispatch
    commands = {
        "start": lambda: cmd_start(args.components),
        "stop": lambda: cmd_stop(args.components, args.all),
        "spawn": lambda: cmd_spawn(" ".join(args.task), args.project, args.model, args.voice, args.quiet),
        "kill": lambda: cmd_kill(args.name),
        "list": lambda: cmd_list(args.all, args.json),
        "send": lambda: cmd_send(args.name, " ".join(args.message)),
        "peek": lambda: cmd_peek(args.name, args.lines),
        "logs": lambda: cmd_logs(args.components),
        "status": lambda: cmd_list(False, False),
        "quit": lambda: cmd_quit(args.status),
    }

    return commands[args.command]()


def cmd_start(components: list[str]):
    """Start Iris components."""
    # Check input group when starting wake (needed for CapsLock)
    starting_wake = not components or "wake" in components
    if starting_wake and not check_input_group():
        fix_input_group()
        # Continue anyway - they might have just added themselves

    if not components:
        # Start everything
        tmux.start_session()
        servers.start_all()
    else:
        for comp in components:
            if comp == "cli":
                tmux.start_session()
            else:
                servers.start(comp)


def cmd_stop(components: list[str], stop_all: bool):
    """Stop Iris components."""
    if stop_all:
        shades.kill_all()
        servers.stop_all()
        tmux.kill_session()
    elif not components:
        servers.stop_all()
    else:
        for comp in components:
            servers.stop(comp)


def cmd_spawn(task: str, project: str | None, model: str | None, voice: str, quiet: bool = False):
    """Spawn a new shade."""
    result = shades.spawn(task, project=project, model=model, voice=voice)
    if result and not quiet:
        print(f"\033[32mSpawned \033[1m{result['name']}\033[0m\033[32m ({result['pane_id']})\033[0m")
        print(f"  Task: {task}")


def cmd_kill(name: str):
    """Kill a shade."""
    if name == "all":
        count = shades.kill_all()
        if count:
            print(f"\033[32mKilled {count} shade(s)\033[0m")
        else:
            print("\033[33mNo shades to kill\033[0m")
    else:
        if shades.kill(name):
            print(f"\033[32mKilled {name}\033[0m")
        else:
            print(f"\033[31mShade '{name}' not found\033[0m")
            sys.exit(1)


def cmd_list(show_all: bool, json_output: bool):
    """List shades."""
    shades.list_shades(show_all=show_all, json_output=json_output)


def cmd_send(name: str, message: str):
    """Send message to shade."""
    if shades.send(name, message):
        print(f"\033[32mSent to {name}:\033[0m {message}")
    else:
        print(f"\033[31mShade '{name}' not found\033[0m")
        sys.exit(1)


def cmd_peek(name: str, lines: int):
    """Peek at shade output."""
    output = shades.peek(name, lines)
    if output is None:
        print(f"\033[31mShade '{name}' not found\033[0m")
        sys.exit(1)
    print(f"\033[1mOutput from {name}:\033[0m")
    print("─" * 40)
    print(output)
    print("─" * 40)


def cmd_logs(components: list[str]):
    """Tail server logs."""
    servers.tail_logs(components)


def cmd_quit(status: str):
    """Self-terminate (for shades)."""
    if shades.quit_self(status):
        # Won't reach here - pane will be killed
        pass
    else:
        print("\033[31mNot running as a shade (no SHADE_UUID)\033[0m")
        sys.exit(1)


if __name__ == "__main__":
    sys.exit(main() or 0)
