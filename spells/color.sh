#!/bin/bash
# Color operations - reads from shades.json (WezTerm native)
# Usage:
#   color.sh next              - Get next available color (JSON)
#   color.sh get <name>        - Get color by name (JSON)
#   color.sh list              - List all color names

IRIS_DIR="$HOME/Iris"
SHADES="$IRIS_DIR/config/shades.json"

case "$1" in
    next)
        # Get colors currently in use from WezTerm tab titles
        USED=$(wezterm cli list --format json 2>/dev/null | \
               jq -r '.[].tab_title // empty' | \
               grep -oE '(Ruby|Amber|Sol|Jade|Azure|Indigo|Violet|Coral|Cyan|Magenta|Crimson|Gold)' || true)

        # Find first available color
        AVAILABLE=$(jq -r --arg used "$USED" '
            .shades[] |
            select(.name as $n | ($used | contains($n) | not)) |
            @json
        ' "$SHADES" | head -1)

        if [ -z "$AVAILABLE" ]; then
            # All used, pick first
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
