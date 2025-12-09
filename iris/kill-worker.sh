#!/bin/bash
# Kill an Iris worker by color
# Usage: kill-worker.sh <color>

SESSIONS_DIR="$HOME/Think/iris/sessions"

COLOR="$1"

if [ -z "$COLOR" ]; then
    echo "Usage: kill-worker.sh <color>"
    exit 1
fi

# Check if worker exists
if [ ! -f "$SESSIONS_DIR/worker-$COLOR.json" ]; then
    echo "Worker $COLOR doesn't exist!"
    exit 1
fi

# Find and kill the pane
PANES=$(tmux list-panes -t iris:master -F '#{pane_index}')

for pane in $PANES; do
    if [ "$pane" = "0" ]; then
        continue
    fi

    CAPTURE=$(tmux capture-pane -t iris:master.$pane -p | head -20)
    if echo "$CAPTURE" | grep -q "worker $COLOR"; then
        tmux kill-pane -t iris:master.$pane
        rm -f "$SESSIONS_DIR/worker-$COLOR.json"
        echo "Killed worker $COLOR"
        exit 0
    fi
done

# If pane not found but JSON exists, just remove the JSON
rm -f "$SESSIONS_DIR/worker-$COLOR.json"
echo "Removed worker $COLOR (pane was already gone)"
