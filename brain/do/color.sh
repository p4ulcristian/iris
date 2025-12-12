#!/bin/bash
# Color operations - reads from settings.json
# Usage:
#   color.sh next              - Get next available shade color (JSON)
#   color.sh get <name>        - Get shade color by name (JSON)
#   color.sh list              - List all shade names
#   color.sh iris              - Get iris colors (JSON)
#   color.sh border            - Get border colors (JSON)

IRIS_DIR="$HOME/Iris"
SETTINGS="$IRIS_DIR/config/settings.json"
SESSION="iris"

case "$1" in
    next)
        # Get colors currently in use from pane titles
        USED=$(tmux list-panes -t "$SESSION" -F '#{pane_title}' 2>/dev/null | \
               grep -oE '(Ruby|Amber|Sol|Jade|Azure|Indigo|Violet|Coral|Cyan|Magenta|Crimson|Gold)' || true)

        # Get available colors, shuffle randomly, pick first
        AVAILABLE=$(jq -r --arg used "$USED" '
            .colors.shades[] |
            select(.name as $n | ($used | contains($n) | not)) |
            @json
        ' "$SETTINGS" | shuf | head -1)

        if [ -z "$AVAILABLE" ]; then
            # All used, pick random from all
            jq -r '.colors.shades[] | @json' "$SETTINGS" | shuf | head -1
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
        jq -r --arg name "$NAME" '.colors.shades[] | select(.name == $name)' "$SETTINGS"
        ;;
    list)
        jq -r '.colors.shades[].name' "$SETTINGS"
        ;;
    iris)
        jq -r '.colors.iris' "$SETTINGS"
        ;;
    border)
        jq -r '.colors.border' "$SETTINGS"
        ;;
    glow)
        jq -r '.colors.glow' "$SETTINGS"
        ;;
    *)
        echo "Usage: color.sh <next|get|list|iris|border|glow>" >&2
        exit 1
        ;;
esac
