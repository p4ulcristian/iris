"""Iris CLI - Python-based orchestration for Iris."""
from __future__ import annotations

import argparse
import grp
import os
import subprocess
import sys
from pathlib import Path

from . import config
from . import tmux
from . import gods
from . import servers


def check_input_group() -> bool:
    """Check if user is in the input group (needed for CapsLock detection).

    Only relevant on Linux - returns True on other platforms.
    """
    import platform
    if platform.system() != "Linux":
        return True  # Not needed on macOS/Windows

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
        description="Iris - messenger of the gods, orchestrating divine workers",
    )
    parser.add_argument("--no-servers", action="store_true", help="Start tmux session without voice servers")
    subparsers = parser.add_subparsers(dest="command")

    # iris (no command) - start everything
    # iris start [components...]
    start_p = subparsers.add_parser("start", help="Start components")
    start_p.add_argument("components", nargs="*", help="Components to start (default: all)")

    # iris stop [components...]
    stop_p = subparsers.add_parser("stop", help="Stop components")
    stop_p.add_argument("components", nargs="*", help="Components to stop (default: servers only)")
    stop_p.add_argument("--all", action="store_true", help="Stop everything including CLI")

    # iris spawn [--project NAME] [--model MODEL] [--voice VOICE] [--god NAME] [--quiet] [--new-tab] TASK
    spawn_p = subparsers.add_parser("spawn", help="Summon a new god")
    spawn_p.add_argument("--project", "-p", help="Project context")
    spawn_p.add_argument("--model", "-m", help="Model to use")
    spawn_p.add_argument("--voice", "-v", help="Voice for god (overrides god default)")
    spawn_p.add_argument("--god", "-g", help="Specific god to summon")
    spawn_p.add_argument("--quiet", "-q", action="store_true", help="Suppress output (for keybindings)")
    spawn_p.add_argument("--new-tab", "-t", action="store_true", help="Spawn in a new tab/window")
    spawn_p.add_argument("task", nargs="+", help="Task description")

    # iris kill NAME|all
    kill_p = subparsers.add_parser("kill", help="Banish a god")
    kill_p.add_argument("name", help="God name or 'all'")

    # iris list [--all] [--json]
    list_p = subparsers.add_parser("list", help="List gods")
    list_p.add_argument("--all", action="store_true", help="Include history")
    list_p.add_argument("--json", action="store_true", help="JSON output")

    # iris send NAME MESSAGE
    send_p = subparsers.add_parser("send", help="Send message to god")
    send_p.add_argument("name", help="God name")
    send_p.add_argument("message", nargs="+", help="Message to send")

    # iris peek NAME [LINES]
    peek_p = subparsers.add_parser("peek", help="View god output")
    peek_p.add_argument("name", help="God name")
    peek_p.add_argument("lines", nargs="?", type=int, default=30, help="Lines to show")

    # iris logs [COMPONENT...]
    logs_p = subparsers.add_parser("logs", help="Tail server logs")
    logs_p.add_argument("components", nargs="*", help="Components to tail")

    # iris status
    subparsers.add_parser("status", help="Show system status")

    # iris quit [--status STATUS] - for gods to self-terminate
    quit_p = subparsers.add_parser("quit", help="Self-terminate (for gods)")
    quit_p.add_argument("--status", "-s", default="fulfilled", help="Final status (default: fulfilled)")

    # iris close - full shutdown (session + all servers)
    subparsers.add_parser("close", help="Full shutdown (session + servers)")

    args = parser.parse_args()

    # No command = start all
    if args.command is None:
        return cmd_start([], no_servers=args.no_servers)

    # Dispatch
    commands = {
        "start": lambda: cmd_start(args.components),
        "stop": lambda: cmd_stop(args.components, args.all),
        "spawn": lambda: cmd_spawn(" ".join(args.task), args.project, args.model, args.voice, args.god, args.quiet, args.new_tab),
        "kill": lambda: cmd_kill(args.name),
        "list": lambda: cmd_list(args.all, args.json),
        "send": lambda: cmd_send(args.name, " ".join(args.message)),
        "peek": lambda: cmd_peek(args.name, args.lines),
        "logs": lambda: cmd_logs(args.components),
        "status": lambda: cmd_list(False, False),
        "quit": lambda: cmd_quit(args.status),
        "close": cmd_close,
    }

    return commands[args.command]()


def cmd_start(components: list[str], no_servers: bool = False):
    """Start Iris components."""
    # Check input group when starting wake (needed for CapsLock)
    starting_wake = not components or "wake" in components
    if starting_wake and not no_servers and not check_input_group():
        fix_input_group()
        # Continue anyway - they might have just added themselves

    if not components:
        # Start everything (or just tmux if --no-servers)
        tmux.start_session()
        if not no_servers:
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
        gods.kill_all()
        servers.stop_all()
        tmux.kill_session()
    elif not components:
        servers.stop_all()
    else:
        for comp in components:
            servers.stop(comp)


def cmd_spawn(task: str, project: str | None, model: str | None, voice: str | None, god_name: str | None, quiet: bool = False, new_tab: bool = False):
    """Summon a new god."""
    result = gods.spawn(task, project=project, model=model, voice=voice, god_name=god_name, new_tab=new_tab)
    if result and not quiet:
        print(f"\033[32mSummoned \033[1m{result['name']}\033[0m\033[32m ({result['pane_id']})\033[0m")
        print(f"  Task: {task}")


def cmd_kill(name: str):
    """Banish a god."""
    if name == "all":
        count = gods.kill_all()
        if count:
            print(f"\033[32mBanished {count} god(s)\033[0m")
        else:
            print("\033[33mNo gods to banish\033[0m")
    else:
        if gods.kill(name):
            print(f"\033[32mBanished {name}\033[0m")
        else:
            print(f"\033[31mGod '{name}' not found\033[0m")
            sys.exit(1)


def cmd_list(show_all: bool, json_output: bool):
    """List gods."""
    gods.list_gods(show_all=show_all, json_output=json_output)


def cmd_send(name: str, message: str):
    """Send message to god."""
    if gods.send(name, message):
        print(f"\033[32mSent to {name}:\033[0m {message}")
    else:
        print(f"\033[31mGod '{name}' not found\033[0m")
        sys.exit(1)


def cmd_peek(name: str, lines: int):
    """Peek at god output."""
    output = gods.peek(name, lines)
    if output is None:
        print(f"\033[31mGod '{name}' not found\033[0m")
        sys.exit(1)
    print(f"\033[1mOutput from {name}:\033[0m")
    print("─" * 40)
    print(output)
    print("─" * 40)


def cmd_logs(components: list[str]):
    """Tail server logs."""
    servers.tail_logs(components)


def cmd_quit(status: str):
    """Self-terminate (for gods)."""
    if gods.quit_self(status):
        # Won't reach here - pane will be killed
        pass
    else:
        print("\033[31mNot running as a god (no GOD_UUID)\033[0m")
        sys.exit(1)


def cmd_close():
    """Full shutdown - stop everything and free resources."""
    print("\033[36mClosing Iris...\033[0m")
    gods.kill_all()
    servers.stop_all()
    tmux.kill_session()
    print("\033[32mIris closed\033[0m")


if __name__ == "__main__":
    sys.exit(main() or 0)
