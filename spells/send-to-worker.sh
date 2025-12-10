#!/bin/bash
# Send a message to a worker pane and press Enter
# Usage: send-to-worker.sh <pane_id> <message>
#
# Uses tmux set-buffer + paste-buffer for faster text input
# (send-keys sends character by character which can be slow for long messages)

PANE_ID="$1"
shift
MESSAGE="$*"

if [ -z "$PANE_ID" ] || [ -z "$MESSAGE" ]; then
    echo "Usage: send-to-worker.sh <pane_id> <message>"
    exit 1
fi

# Use buffer for faster pasting (especially for long messages)
# Buffer name includes pane_id to avoid conflicts with concurrent sends
BUFFER_NAME="worker-msg-$$-$PANE_ID"
tmux set-buffer -b "$BUFFER_NAME" "$MESSAGE"
tmux paste-buffer -t "$PANE_ID" -b "$BUFFER_NAME" -d
tmux send-keys -t "$PANE_ID" Enter
