#!/bin/bash
# Layout manager for Iris tmux session
#
# Layout: Master (35% left) | Workers (65% right)
# Workers arranged in columns, up to 4 per column.
#
# NEW APPROACH: No join-pane operations. Just resize existing panes.
# The structure is built by pane.sh splitting from the correct target.
# This script only handles sizing.

SESSION="${1:-iris}"

# Get pane count and IDs
PANE_COUNT=$(tmux list-panes -t "$SESSION" 2>/dev/null | wc -l)
PANES=($(tmux list-panes -t "$SESSION" -F '#{pane_id}' 2>/dev/null))
MASTER="${PANES[0]}"

if [ "$PANE_COUNT" -lt 2 ]; then
    exit 0
fi

# Get window dimensions
WIN_WIDTH=$(tmux display -t "$SESSION" -p '#{window_width}')
WIN_HEIGHT=$(tmux display -t "$SESSION" -p '#{window_height}')

# Calculate master width (35%)
MASTER_WIDTH=$((WIN_WIDTH * 35 / 100))

# Resize master to 35%
tmux resize-pane -t "$MASTER" -x "$MASTER_WIDTH" 2>/dev/null

# Select master pane
tmux select-pane -t "$MASTER"
