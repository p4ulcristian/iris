#!/bin/bash
# Kill a shade by name or UUID
# Usage: kill.sh <name-or-uuid>
#
# Composes: pane.sh, layout.sh
# State: queries tmux pane titles, writes outcome to shadows folder

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IRIS_DIR="$HOME/Iris"
SHADOWS_DIR="$IRIS_DIR/shadows"

INPUT="$1"

if [ -z "$INPUT" ]; then
    echo "Usage: kill.sh <name-or-uuid>"
    exit 1
fi

# Find shade by name or UUID from tmux pane titles
# Format: Name|uuid|project
find_shade() {
    local search="${1,,}"  # lowercase

    while IFS=: read -r pane_id title; do
        [[ "$title" != *"|"* ]] && continue

        IFS='|' read -r name uuid project <<< "$title"
        [[ -z "$uuid" ]] && continue

        # Match by UUID or name (case insensitive)
        if [[ "$uuid" == "$1" ]] || [[ "${name,,}" == "$search" ]]; then
            echo "$pane_id:$name:$uuid"
            return 0
        fi
    done < <(tmux list-panes -t iris -F '#{pane_id}:#{pane_title}' 2>/dev/null)

    return 1
}

SHADE_INFO=$(find_shade "$INPUT")

if [ -z "$SHADE_INFO" ]; then
    echo "Shade '$INPUT' not found"
    exit 1
fi

IFS=: read -r PANE_ID NAME UUID <<< "$SHADE_INFO"

# Don't kill master
if [ "$PANE_ID" = "%0" ]; then
    echo "Cannot kill master pane"
    exit 1
fi

# Record outcome in shadows folder
SHADOW_DIR="$SHADOWS_DIR/$UUID"
if [ -d "$SHADOW_DIR" ]; then
    echo "killed" > "$SHADOW_DIR/outcome.txt"
    date -Iseconds > "$SHADOW_DIR/died.txt"
fi

# Stop pipe-pane logging
tmux pipe-pane -t "$PANE_ID"

# Kill pane
"$SCRIPT_DIR/pane.sh" kill "$PANE_ID"

echo "Killed $NAME ($PANE_ID)"
