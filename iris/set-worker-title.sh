#!/bin/bash
# Set worker pane title with colored name
# Usage: set-worker-title.sh <pane_id> <name> <color_hex> <task>
# Example: set-worker-title.sh %21 Fred "#8b3a3a" "Fixing bug"

PANE_ID="$1"
NAME="$2"
COLOR="$3"
shift 3
TASK="$*"

if [ -z "$PANE_ID" ] || [ -z "$NAME" ] || [ -z "$COLOR" ]; then
    echo "Usage: set-worker-title.sh <pane_id> <name> <color_hex> <task>"
    exit 1
fi

tmux select-pane -t "$PANE_ID" -T "#[bg=$COLOR,fg=white,bold] $NAME - $TASK "
