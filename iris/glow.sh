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

# Build glow command with pager mode and mouse scrolling
GLOW_CMD="LESS='-R --mouse' glow -p $*"

# Create pane running glow
PANE_ID=$(tmux split-window -t iris -h -d -P -F '#{pane_id}' "$GLOW_CMD")

# Set a distinct color for glow panes
tmux select-pane -t "$PANE_ID" -P "bg=#1a1a1a"
tmux select-pane -t "$PANE_ID" -T "#[bg=#888888,fg=white,bold] Glow "

# Apply layout and refocus master
"$SCRIPT_DIR/smart-layout.sh" iris 2>/dev/null

echo "$PANE_ID"
