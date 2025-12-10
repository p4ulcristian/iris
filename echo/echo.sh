#!/bin/bash
# Echo - unified voice assistant server
# Starts the server with STT + TTS, handles PTT via CapsLock

# Resolve symlinks to get the real script location
SCRIPT_PATH="$(readlink -f "$0")"
ECHO_DIR="$(dirname "$SCRIPT_PATH")"

# PID and log file locations
PID_FILE="/tmp/echo.pid"
LOG_FILE="$HOME/.local/share/echo/logs.txt"
mkdir -p "$(dirname "$LOG_FILE")"

# Handle commands
case "${1:-start}" in
    stop)
        if [ -f "$PID_FILE" ]; then
            PID=$(cat "$PID_FILE")
            kill "$PID" 2>/dev/null && echo "Echo stopped" || echo "Echo not running"
            rm -f "$PID_FILE"
        else
            echo "Echo not running"
        fi
        exit 0
        ;;
    logs)
        tail -f "$LOG_FILE"
        exit 0
        ;;
    status)
        if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
            echo "Echo is running (PID: $(cat "$PID_FILE"))"
        else
            echo "Echo is not running"
        fi
        exit 0
        ;;
    start|"")
        # Check if already running (only for start command)
        if [ -f "$PID_FILE" ]; then
            PID=$(cat "$PID_FILE")
            if kill -0 "$PID" 2>/dev/null; then
                echo "Echo is already running (PID: $PID)"
                echo "Use 'echo stop' to stop it, or 'echo logs' to view logs"
                exit 0
            fi
        fi
        ;;
    *)
        echo "Usage: echo [start|stop|logs|status]"
        exit 1
        ;;
esac

# Start in background
echo "Starting Echo..."
cd "$ECHO_DIR"

echo "" >> "$LOG_FILE"
echo "=== Echo started at $(date) ===" >> "$LOG_FILE"

nohup .venv/bin/python -m echo.server >> "$LOG_FILE" 2>&1 &

echo "Echo running in background (PID: $!)"
echo "Use 'echo logs' to view logs, 'echo stop' to stop"
