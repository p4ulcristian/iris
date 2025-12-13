"""Server management - start/stop hear, speak, express, wake."""

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


def _get_venv_python() -> Path:
    """Get the path to the venv Python interpreter."""
    venv = config.BRAIN_DIR / ".venv"
    if venv.exists():
        return venv / "bin" / "python"
    # Fallback to current Python
    return Path(sys.executable)


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

    # Check for run.sh script (handles venv + env vars)
    run_script = script_path.parent / "run.sh"

    print(f"\033[36mStarting {name}...\033[0m")

    # Open log file for output
    with open(log_file, "a") as log:
        if run_script.exists():
            # Use run.sh which sets up venv and env vars correctly
            process = subprocess.Popen(
                ["bash", str(run_script)],
                stdout=log,
                stderr=log,
                start_new_session=True,
            )
        else:
            # Fallback to direct python execution
            process = subprocess.Popen(
                [str(_get_venv_python()), str(script_path)],
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
    """Tail log files for components."""
    if not components:
        components = list(SERVERS.keys())

    log_files = []
    for name in components:
        if name in SERVERS:
            log_file = _log_file(name)
            if log_file.exists():
                log_files.append(str(log_file))

    if not log_files:
        print("\033[33mNo log files found\033[0m")
        return

    try:
        # Use tail -f to follow logs
        subprocess.run(["tail", "-f"] + log_files)
    except KeyboardInterrupt:
        pass
