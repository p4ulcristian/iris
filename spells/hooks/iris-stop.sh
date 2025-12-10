#!/bin/bash
# Iris stopped responding - start 5-sec timer to set idle

IRIS_DIR="/tmp/iris"
mkdir -p "$IRIS_DIR"

# Kill any existing timer
if [ -f "$IRIS_DIR/busy-timer.pid" ]; then
  kill "$(cat "$IRIS_DIR/busy-timer.pid")" 2>/dev/null
  rm -f "$IRIS_DIR/busy-timer.pid"
fi

# Start background timer
(
  sleep 5
  touch "$IRIS_DIR/idle"
  rm -f "$IRIS_DIR/busy-timer.pid"
) &

echo $! > "$IRIS_DIR/busy-timer.pid"

echo '{"continue": true}'
