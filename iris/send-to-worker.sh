#!/bin/bash
# Send a message to a worker pane and press Enter
# Usage: send-to-worker.sh <pane_id> <message>

PANE_ID="$1"
shift
MESSAGE="$*"

if [ -z "$PANE_ID" ] || [ -z "$MESSAGE" ]; then
    echo "Usage: send-to-worker.sh <pane_id> <message>"
    exit 1
fi

tmux send-keys -t "$PANE_ID" "$MESSAGE"
tmux send-keys -t "$PANE_ID" Enter
