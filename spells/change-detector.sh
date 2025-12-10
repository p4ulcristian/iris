#!/bin/bash
# change-detector.sh - touch file on any iris pane activity
# Run once at startup. Messenger derives idle from mtime.

IRIS_DIR="/tmp/iris"
ACTIVITY_FILE="$IRIS_DIR/pane-activity"
mkdir -p "$IRIS_DIR"
touch "$ACTIVITY_FILE"

# Use pipe-pane to detect Iris pane output (iris:0.0 only)
# pipe-pane is per-pane, so shade output won't trigger it
# -O connects pane output to the command's stdin
tmux pipe-pane -t iris:0.0 -O "while read -r line; do touch $ACTIVITY_FILE; done"

echo "Change detector installed for iris:0.0 via pipe-pane"
