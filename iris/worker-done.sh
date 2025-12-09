#!/bin/bash
# Worker calls this when finished with a task
# Usage: worker-done.sh <pane_id> <name> <color_hex> [summary]
# Example: worker-done.sh %21 Fred "#8b3a3a" "Fixed the bug"

PANE_ID="$1"
NAME="$2"
COLOR="$3"
shift 3
SUMMARY="${*:-Done}"

if [ -z "$PANE_ID" ] || [ -z "$NAME" ] || [ -z "$COLOR" ]; then
    echo "Usage: worker-done.sh <pane_id> <name> <color_hex> [summary]"
    exit 1
fi

# Update title to show done
tmux select-pane -t "$PANE_ID" -T "#[bg=$COLOR,fg=white,bold] $NAME ✓ $SUMMARY "

# Write to done file for Iris to check
echo "$PANE_ID|$NAME|$SUMMARY|$(date +%H:%M:%S)" >> /tmp/iris-workers-done
