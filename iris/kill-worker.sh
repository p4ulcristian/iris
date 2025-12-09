#!/bin/bash
# Kill an Iris worker by name
# Usage: kill-worker.sh <name>
# Example: kill-worker.sh Neil

NAME="$1"

if [ -z "$NAME" ]; then
    echo "Usage: kill-worker.sh <name>"
    echo "Available workers:"
    tmux list-panes -t iris -F '#{pane_id} #{pane_title}' | grep -v '%0 ' | sed 's/.*bold\] /  /' | sed 's/ -.*//'
    exit 1
fi

# Find pane by name in title
PANE_ID=$(tmux list-panes -t iris -F '#{pane_id} #{pane_title}' | grep -i "$NAME" | head -1 | awk '{print $1}')

if [ -z "$PANE_ID" ]; then
    echo "Worker '$NAME' not found"
    echo "Available workers:"
    tmux list-panes -t iris -F '#{pane_id} #{pane_title}' | grep -v '%0 ' | sed 's/.*bold\] /  /' | sed 's/ -.*//'
    exit 1
fi

# Don't kill master pane
if [ "$PANE_ID" = "%0" ]; then
    echo "Can't kill master pane!"
    exit 1
fi

# Kill the pane
tmux kill-pane -t "$PANE_ID"
echo "Killed worker $NAME ($PANE_ID)"

# Realign layout for remaining panes
sleep 0.2
./iris/smart-layout.sh iris
