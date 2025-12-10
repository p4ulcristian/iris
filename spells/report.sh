#!/bin/bash
# Shade reports to Iris
# Usage: ./spells/report.sh "message"

UUID="${SHADE_UUID:-}"
[ -z "$UUID" ] && { echo "Error: SHADE_UUID not set"; exit 1; }

MSG="$1"
[ -z "$MSG" ] && { echo "Usage: report.sh \"message\""; exit 1; }

IRIS_DIR="/tmp/iris"
QUEUE="$IRIS_DIR/queue"
mkdir -p "$IRIS_DIR"

# Get shade name
NAME="${SHADE_NAME:-}"
if [ -z "$NAME" ]; then
  SHADOWS_DIR="$HOME/Iris/shadows"
  [ -f "$SHADOWS_DIR/$UUID/name.txt" ] && NAME=$(cat "$SHADOWS_DIR/$UUID/name.txt")
fi
NAME="${NAME:-Unknown}"

# Atomic append to queue
echo "$NAME: $MSG" >> "$QUEUE"

echo "Reported to Iris"
