#!/bin/bash
# Queue daemon - sends queued messages to Iris when she's idle

IRIS_DIR="/tmp/iris"
QUEUE="$IRIS_DIR/queue"
IDLE_FLAG="$IRIS_DIR/idle"
PID_FILE="$IRIS_DIR/daemon.pid"
LOG_FILE="$IRIS_DIR/daemon.log"
POLL_INTERVAL=2

mkdir -p "$IRIS_DIR"
touch "$QUEUE"

# Check if already running
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Queue daemon already running (PID $OLD_PID)"
    exit 0
  fi
fi

echo $$ > "$PID_FILE"
echo "[$(date -Iseconds)] Queue daemon started (PID $$)" >> "$LOG_FILE"

cleanup() {
  rm -f "$PID_FILE"
  echo "[$(date -Iseconds)] Queue daemon stopped" >> "$LOG_FILE"
  exit 0
}

trap cleanup SIGTERM SIGINT

while true; do
  sleep "$POLL_INTERVAL"

  # Check if Iris is idle
  [ ! -f "$IDLE_FLAG" ] && continue

  # Check if queue has messages
  [ ! -s "$QUEUE" ] && continue

  # Process queue (atomic read + clear)
  (
    flock 200

    # Read all messages
    MESSAGES=$(cat "$QUEUE")

    # Clear queue
    > "$QUEUE"

    # Send each message to Iris pane
    while IFS= read -r msg; do
      [ -z "$msg" ] && continue
      tmux send-keys -t iris:0.0 "# $msg"
      sleep 0.1
      tmux send-keys -t iris:0.0 Enter
      echo "[$(date -Iseconds)] Sent: $msg" >> "$LOG_FILE"
      sleep 0.5  # Small delay between messages
    done <<< "$MESSAGES"

  ) 200>"$QUEUE.lock"

done
