#!/bin/bash
# Send a task to an Iris worker by color
# Usage: task-worker.sh <color> <task>

SESSIONS_DIR="$HOME/Think/shadows"

COLOR="$1"
shift
TASK="$*"

if [ -z "$COLOR" ] || [ -z "$TASK" ]; then
    echo "Usage: task-worker.sh <color> <task>"
    exit 1
fi

# Check if worker exists
if [ ! -f "$SESSIONS_DIR/worker-$COLOR.json" ]; then
    echo "Worker $COLOR doesn't exist!"
    exit 1
fi

# Find the pane for this worker by checking each pane
# We need to find which pane has this worker
PANES=$(tmux list-panes -t iris:master -F '#{pane_index}')

for pane in $PANES; do
    # Skip master pane
    if [ "$pane" = "0" ]; then
        continue
    fi

    # Send to this pane (we'll need a better way to track pane<->color mapping)
    # For now, we'll just broadcast to all non-master panes and let the right worker respond
    # Actually, let's store pane ID in the JSON
done

# For now, find the pane by capturing and checking
# This is a temporary solution - we should store pane_id in the JSON
for pane in $PANES; do
    if [ "$pane" = "0" ]; then
        continue
    fi

    # Check if this pane's worker matches our color by reading its capture
    CAPTURE=$(tmux capture-pane -t iris:master.$pane -p | head -20)
    if echo "$CAPTURE" | grep -q "worker $COLOR"; then
        tmux send-keys -t iris:master.$pane "$TASK" Enter
        echo "Sent task to worker $COLOR (pane $pane): $TASK"
        exit 0
    fi
done

echo "Could not find pane for worker $COLOR"
exit 1
