#!/bin/bash
# Send a message to a shade pane (WezTerm native)
# Usage: send.sh <pane_id> <message>

PANE_ID="$1"
shift
MESSAGE="$*"

if [ -z "$PANE_ID" ] || [ -z "$MESSAGE" ]; then
    echo "Usage: send.sh <pane_id> <message>"
    exit 1
fi

# Send text to pane, then send Enter
wezterm cli send-text --pane-id "$PANE_ID" --no-paste "$MESSAGE"
# Send Enter key
wezterm cli send-text --pane-id "$PANE_ID" --no-paste $'\n'
