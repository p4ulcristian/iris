#!/bin/bash
# Shade reports completion status to Iris
# Usage: ./spells/report.sh "summary of what was done" ["request for Iris if any"]
#
# Called by shades when they complete a task. Queues message for Iris.
# If no request, just reports completion. If request, asks for help.

UUID="${SHADE_UUID:-}"
[ -z "$UUID" ] && { echo "Error: SHADE_UUID not set"; exit 1; }

SUMMARY="$1"
REQUEST="${2:-}"

[ -z "$SUMMARY" ] && { echo "Usage: report.sh \"summary\" [\"request\"]"; exit 1; }

IRIS_DIR="/tmp/iris"
QUEUE="$IRIS_DIR/queue"
mkdir -p "$IRIS_DIR"

# Get shade name from shadows folder or environment
SHADOWS_DIR="$HOME/Iris/shadows"
if [ -f "$SHADOWS_DIR/$UUID/name.txt" ]; then
    NAME=$(cat "$SHADOWS_DIR/$UUID/name.txt")
else
    NAME="${SHADE_NAME:-Unknown shade}"
fi

# Build message
if [ -n "$REQUEST" ]; then
  MSG="$NAME: $SUMMARY. Request: $REQUEST"
else
  MSG="$NAME: $SUMMARY"
fi

# Write to status file for shade-stop.sh to find
echo "$MSG" > "$IRIS_DIR/status-$UUID"

echo "Report queued for Iris"
