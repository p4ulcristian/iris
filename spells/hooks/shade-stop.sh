#!/bin/bash
# Shade stopped - queue notification for Iris

UUID="${SHADE_UUID:-}"
[ -z "$UUID" ] && exit 0

IRIS_DIR="/tmp/iris"
QUEUE="$IRIS_DIR/queue"
STATE_DIR="$IRIS_DIR/shade-state"
STATUS_FILE="$IRIS_DIR/status-$UUID"
mkdir -p "$IRIS_DIR" "$STATE_DIR"

# Debounce: only queue if 3+ seconds since last stop
NOW=$(date +%s)
LAST=$(cat "$STATE_DIR/$UUID" 2>/dev/null || echo 0)
echo "$NOW" > "$STATE_DIR/$UUID"

[ $((NOW - LAST)) -lt 3 ] && exit 0

# Check for status report from shade (from report.sh)
if [ -f "$STATUS_FILE" ]; then
  MSG=$(cat "$STATUS_FILE")
  rm -f "$STATUS_FILE"
else
  # No report - don't notify (shades should report their results)
  exit 0
fi

# Append to queue (atomic with flock)
(
  flock 200
  echo "$MSG" >> "$QUEUE"
) 200>"$QUEUE.lock"

echo '{"continue": true}'
