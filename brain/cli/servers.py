"""Server management - start/stop hear, speak, express, wake."""
from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from pathlib import Path

from . import config


# Server definitions: name -> (script path relative to brain/, port or None)
SERVERS = {
    "hear": ("hear/server.py", 8766),
    "speak": ("speak/server.py", 8765),
    "express": ("express/server.py", 8767),
    "wake": ("wake/listener.py", None),
    "wakeword": ("wake/detector.py", None),
}


def _pid_file(name: str) -> Path:
    return config.PID_DIR / f"{name}.pid"


def _log_file(name: str) -> Path:
    return config.LOG_DIR / f"{name}.log"


def _is_running(name: str) -> tuple[bool, int | None]:
    """Check if a server is running. Returns (running, pid)."""
    pid_file = _pid_file(name)
    if not pid_file.exists():
        return False, None

    try:
        pid = int(pid_file.read_text().strip())
        # Check if process exists
        os.kill(pid, 0)
        return True, pid
    except (ValueError, ProcessLookupError, PermissionError):
        # Stale PID file
        pid_file.unlink(missing_ok=True)
        return False, None


def start(name: str) -> bool:
    """Start a server component."""
    if name not in SERVERS:
        print(f"\033[31mUnknown component: {name}\033[0m")
        return False

    running, pid = _is_running(name)
    if running:
        print(f"\033[33m{name} already running (PID: {pid})\033[0m")
        return True

    config.ensure_dirs()

    script, port = SERVERS[name]
    script_path = config.BRAIN_DIR / script
    log_file = _log_file(name)
    pid_file = _pid_file(name)

    print(f"\033[36mStarting {name}...\033[0m")

    # Open log file for output
    with open(log_file, "a") as log:
        # Use uv run to handle dependencies via inline script metadata
        process = subprocess.Popen(
            ["uv", "run", str(script_path)],
            stdout=log,
            stderr=log,
            start_new_session=True,
        )

    # Write PID
    pid_file.write_text(str(process.pid))

    # Wait a bit and verify
    time.sleep(0.5)
    running, pid = _is_running(name)
    if running:
        print(f"\033[32m{name} started (PID: {pid})\033[0m")
        return True
    else:
        print(f"\033[31mFailed to start {name}\033[0m")
        return False


def stop(name: str) -> bool:
    """Stop a server component."""
    if name not in SERVERS:
        print(f"\033[31mUnknown component: {name}\033[0m")
        return False

    running, pid = _is_running(name)
    if not running:
        print(f"\033[33m{name} not running\033[0m")
        return True

    print(f"\033[36mStopping {name}...\033[0m")

    try:
        os.kill(pid, signal.SIGTERM)
        # Wait for graceful shutdown
        for _ in range(10):
            time.sleep(0.1)
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                break
        else:
            # Force kill if still running
            os.kill(pid, signal.SIGKILL)
    except ProcessLookupError:
        pass  # Already dead

    _pid_file(name).unlink(missing_ok=True)
    print(f"\033[32m{name} stopped\033[0m")
    return True


def start_all():
    """Start all server components."""
    for name in SERVERS:
        start(name)


def stop_all():
    """Stop all server components."""
    for name in SERVERS:
        stop(name)


def status() -> dict[str, dict]:
    """Get status of all servers."""
    result = {}
    for name in SERVERS:
        running, pid = _is_running(name)
        result[name] = {
            "running": running,
            "pid": pid,
            "port": SERVERS[name][1],
        }
    return result


def tail_logs(components: list[str] | None = None):
    """Tail log files for components (pure Python implementation)."""
    if not components:
        components = list(SERVERS.keys())

    # Build list of (name, log_file) pairs
    logs = []
    for name in components:
        if name in SERVERS:
            log_file = _log_file(name)
            if log_file.exists():
                logs.append((name, log_file))

    if not logs:
        print("\033[33mNo log files found\033[0m")
        return

    # Open files and seek to end
    handles = []
    for name, log_file in logs:
        f = open(log_file, 'r')
        f.seek(0, 2)  # Seek to end
        handles.append((name, f))

    # Colors for different components
    colors = {
        "speak": "\033[33m",    # Yellow
        "hear": "\033[36m",     # Cyan
        "express": "\033[35m",  # Magenta
        "wake": "\033[32m",     # Green
        "wakeword": "\033[34m", # Blue
    }
    reset = "\033[0m"

    print("\033[36mTailing logs (Ctrl+C to stop)...\033[0m")

    try:
        while True:
            for name, f in handles:
                line = f.readline()
                if line:
                    color = colors.get(name, "\033[37m")
                    print(f"{color}[{name}]{reset} {line}", end="")
            time.sleep(0.1)
    except KeyboardInterrupt:
        pass
    finally:
        for _, f in handles:
            f.close()
