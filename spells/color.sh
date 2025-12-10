#!/bin/bash
# Color operations - reads from shades.json
# Usage:
#   color.sh next              - Get next available color (JSON)
#   color.sh get <name>        - Get color by name (JSON)
#   color.sh list              - List all color names

IRIS_DIR="$HOME/Iris"
SHADES="$IRIS_DIR/config/shades.json"
SESSION="iris"

case "$1" in
    next)
        # Get colors currently in use from pane titles
        USED=$(tmux list-panes -t "$SESSION" -F '#{pane_title}' 2>/dev/null | \
               grep -oE '(Ruby|Amber|Sol|Jade|Azure|Indigo|Violet|Coral|Cyan|Magenta|Crimson|Gold)' || true)

        # Find first available color
        AVAILABLE=$(jq -r --arg used "$USED" '
            .shades[] |
            select(.name as $n | ($used | contains($n) | not)) |
            @json
        ' "$SHADES" | head -1)

        if [ -z "$AVAILABLE" ]; then
            # All used, pick random
            jq '.shades[0]' "$SHADES"
        else
            echo "$AVAILABLE"
        fi
        ;;
    get)
        NAME="$2"
        if [ -z "$NAME" ]; then
            echo "Usage: color.sh get <name>" >&2
            exit 1
        fi
        jq -r --arg name "$NAME" '.shades[] | select(.name == $name)' "$SHADES"
        ;;
    list)
        jq -r '.shades[].name' "$SHADES"
        ;;
    *)
        echo "Usage: color.sh <next|get|list>" >&2
        exit 1
        ;;
esac
