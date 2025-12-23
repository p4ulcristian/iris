#!/bin/bash
# Pick a pane to banish

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IRIS_DIR="${IRIS_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
cd "$IRIS_DIR"

# Use vendored fzf if available
ARCH=$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
FZF="$IRIS_DIR/vendor/bin/fzf-${OS}-${ARCH}"
[[ ! -x "$FZF" ]] && FZF="fzf"

# Get panes: "pane_id|title"
PANES=$(tmux list-panes -s -F '#{pane_id}|#{pane_title}' 2>/dev/null | grep -v "^%0|")

if [ -z "$PANES" ]; then
    echo "No panes to banish"
    sleep 1
    exit 0
fi

# Show picker (display title only)
SELECTED=$(echo "$PANES" | cut -d'|' -f2 | \
    "$FZF" --height=100% \
        --no-info \
        --pointer='>' \
        --prompt='Banish: ' \
        --layout=reverse)

[ -z "$SELECTED" ] && exit 0

# Find pane ID for selected title
PANE_ID=$(echo "$PANES" | grep "|$SELECTED$" | head -1 | cut -d'|' -f1)

if [ -n "$PANE_ID" ]; then
    # Kill the process and pane
    PID=$(tmux display-message -p -t "$PANE_ID" '#{pane_pid}')
    kill -9 "$PID" 2>/dev/null
    tmux kill-pane -t "$PANE_ID" 2>/dev/null
fi
