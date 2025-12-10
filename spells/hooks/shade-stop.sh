#!/bin/bash
# Shade stopped - queue notification for Iris

UUID="${SHADE_UUID:-}"
[ -z "$UUID" ] && exit 0

IRIS_DIR="/tmp/iris"
QUEUE="$IRIS_DIR/queue"
STATE_DIR="$IRIS_DIR/shade-state"
mkdir -p "$IRIS_DIR" "$STATE_DIR"

# Debounce: only queue if 3+ seconds since last stop
NOW=$(date +%s)
LAST=$(cat "$STATE_DIR/$UUID" 2>/dev/null || echo 0)
echo "$NOW" > "$STATE_DIR/$UUID"

[ $((NOW - LAST)) -lt 3 ] && exit 0

# Get shade name
NAME=$(jq -r --arg uuid "$UUID" '.active[$uuid].name // empty' \
  /home/paul/Iris/spells/sessions/registry.json)
[ -z "$NAME" ] && exit 0

# Append to queue (atomic with flock)
(
  flock 200
  echo "$NAME is idle" >> "$QUEUE"
) 200>"$QUEUE.lock"

echo '{"continue": true}'
