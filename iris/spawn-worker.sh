#!/bin/bash
# Spawn a new Iris worker pane with color-based ID
# Usage: spawn-worker.sh [color]
# If no color given, picks the next available from palette

SESSIONS_DIR="$HOME/Think/iris/sessions"
COLORS_FILE="$HOME/Think/iris/colors.json"

# All available colors
COLORS=(red teal yellow mint plum sky orange lavender coral lime pink gold cyan peach violet seafoam)

# Hex values for backgrounds (darkened versions)
declare -A HEX_COLORS
HEX_COLORS[red]="#2a1a1a"
HEX_COLORS[teal]="#1a2a2a"
HEX_COLORS[yellow]="#2a2a1a"
HEX_COLORS[mint]="#1a2a22"
HEX_COLORS[plum]="#2a1a2a"
HEX_COLORS[sky]="#1a222a"
HEX_COLORS[orange]="#2a221a"
HEX_COLORS[lavender]="#221a2a"
HEX_COLORS[coral]="#2a1f1a"
HEX_COLORS[lime]="#1a2a1a"
HEX_COLORS[pink]="#2a1a22"
HEX_COLORS[gold]="#2a2a1a"
HEX_COLORS[cyan]="#1a2a2a"
HEX_COLORS[peach]="#2a261f"
HEX_COLORS[violet]="#261a2a"
HEX_COLORS[seafoam]="#1a2622"

# Find next available color
get_next_color() {
    for color in "${COLORS[@]}"; do
        if [ ! -f "$SESSIONS_DIR/worker-$color.json" ]; then
            echo "$color"
            return
        fi
    done
    echo ""
}

# Get color from argument or find next available
if [ -n "$1" ]; then
    COLOR="$1"
else
    COLOR=$(get_next_color)
fi

if [ -z "$COLOR" ]; then
    echo "No available colors! Kill some workers first."
    exit 1
fi

# Check if this color is already in use
if [ -f "$SESSIONS_DIR/worker-$COLOR.json" ]; then
    echo "Worker $COLOR already exists!"
    exit 1
fi

BG_COLOR="${HEX_COLORS[$COLOR]}"
if [ -z "$BG_COLOR" ]; then
    BG_COLOR="#1a1a2a"
fi

# Split window (don't focus new pane) and capture new pane ID
PANE_ID=$(tmux split-window -t iris:master -h -d -P -F '#{pane_index}')

# Set pane style
tmux select-pane -t iris:master.$PANE_ID -P "bg=$BG_COLOR"

# Start Claude
tmux send-keys -t iris:master.$PANE_ID "cd ~/Think && claude" Enter

# Wait for Claude to load
sleep 6

# Send initialization prompt
tmux send-keys -t iris:master.$PANE_ID "You are worker $COLOR. You are a silent Iris worker.

Rules:
- NEVER use ./say.sh - only master speaks
- Write your status to ~/Think/iris/sessions/worker-$COLOR.json
- Update the JSON when you start a task, complete it, or hit an error

Status JSON format:
{\"id\": \"$COLOR\", \"status\": \"working|idle|done|error\", \"task\": \"description\", \"result\": \"summary\", \"updated\": \"ISO timestamp\"}

Confirm you understand by writing an initial idle status to your JSON file."

# Push enter to submit
sleep 1
tmux send-keys -t iris:master.$PANE_ID Enter

# Return focus to master and send an empty key to refresh
tmux select-pane -t iris:master.0
tmux send-keys -t iris:master.0 ""

echo "Spawned worker $COLOR"
