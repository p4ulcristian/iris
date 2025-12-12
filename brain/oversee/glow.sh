#!/bin/bash
# Open glow in a tmux pane to view markdown files
# Usage: glow.sh <file.md> [file2.md...]
#
# Examples:
#   glow.sh README.md           # View README in a pane
#   glow.sh docs/*.md           # View multiple files

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ $# -eq 0 ]; then
    echo "Usage: glow.sh <file.md> [file2.md...]"
    exit 1
fi

# Load colors from config
GLOW_JSON=$("$SCRIPT_DIR/color.sh" glow)
GLOW_BG=$(echo "$GLOW_JSON" | jq -r '.bg')

# Build glow command with pager mode and mouse scrolling
GLOW_CMD="LESS='-R --mouse' glow -p $*"

# Create pane running glow
PANE_ID=$(tmux split-window -t iris -h -d -P -F '#{pane_id}' "$GLOW_CMD")

# Set a distinct color for glow panes
tmux select-pane -t "$PANE_ID" -P "bg=$GLOW_BG"
tmux select-pane -t "$PANE_ID" -T "Glow"

# Apply layout and refocus master
"$SCRIPT_DIR/layout.sh" iris 2>/dev/null

echo "$PANE_ID"
