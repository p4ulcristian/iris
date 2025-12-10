#!/bin/bash
# messenger.sh - delivers queued messages to Iris when idle
# Idle = no pane activity for 5 seconds (derived from mtime)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IRIS_DIR="/tmp/iris"
QUEUE="$IRIS_DIR/queue"
ACTIVITY="$IRIS_DIR/pane-activity"
PID_FILE="$IRIS_DIR/messenger.pid"
LOG_FILE="$IRIS_DIR/messenger.log"
IDLE_SECONDS=5
POLL_INTERVAL=2

mkdir -p "$IRIS_DIR"

# Check if already running
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Messenger already running (PID $OLD_PID)"
    exit 0
  fi
fi

echo $$ > "$PID_FILE"
echo "[$(date -Iseconds)] Messenger started (PID $$)" >> "$LOG_FILE"

cleanup() {
  rm -f "$PID_FILE"
  echo "[$(date -Iseconds)] Messenger stopped" >> "$LOG_FILE"
  exit 0
}

trap cleanup SIGTERM SIGINT

while true; do
  sleep "$POLL_INTERVAL"

  # Check idle: mtime older than IDLE_SECONDS?
  [ ! -f "$ACTIVITY" ] && continue
  LAST=$(stat -c %Y "$ACTIVITY")
  NOW=$(date +%s)
  [ $((NOW - LAST)) -lt "$IDLE_SECONDS" ] && continue

  # Queue empty?
  [ ! -s "$QUEUE" ] && continue

  # Atomic move + process
  mv "$QUEUE" "$QUEUE.processing" 2>/dev/null || continue

  # Send entire queue as single block
  CONTENT=$(cat "$QUEUE.processing")
  [ -z "$CONTENT" ] && { rm -f "$QUEUE.processing"; continue; }

  "$SCRIPT_DIR/send.sh" "iris:0.0" "# $CONTENT"
  echo "[$(date -Iseconds)] Sent block: $(echo "$CONTENT" | wc -l) lines" >> "$LOG_FILE"

  rm -f "$QUEUE.processing"
done
