#!/bin/bash
# Iris is busy - cancel idle timer, remove flag

IRIS_DIR="/tmp/iris"

# Kill pending idle timer if exists
if [ -f "$IRIS_DIR/busy-timer.pid" ]; then
  kill "$(cat "$IRIS_DIR/busy-timer.pid")" 2>/dev/null
  rm -f "$IRIS_DIR/busy-timer.pid"
fi

# Remove idle flag
rm -f "$IRIS_DIR/idle"

exit 0
