#!/bin/bash
# Set shade pane title
# Usage:
#   title.sh <pane_id> <name> <color_hex> <task>   - Direct mode
#   title.sh <uuid> <task>                          - UUID mode (looks up registry)
#   title.sh iris <task>                            - Iris mode (targets main pane)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Handle Iris special case
if [[ "$1" == "iris" ]]; then
    shift
    TASK="$*"
    if [ -z "$TASK" ]; then
        tmux select-pane -t "iris:0.0" -T "Iris"
    else
        tmux select-pane -t "iris:0.0" -T "Iris - $TASK"
    fi
    exit 0
fi

# Detect UUID format
if [[ "$1" =~ ^[a-z]+-[0-9]{8}-[0-9]{6}-[a-f0-9]{4}$ ]]; then
    # UUID mode
    UUID="$1"
    shift
    TASK="$*"

    SHADE_JSON=$("$SCRIPT_DIR/registry.sh" get "$UUID")
    if [ -z "$SHADE_JSON" ]; then
        echo "Shade '$UUID' not found" >&2
        exit 1
    fi

    PANE_ID=$(echo "$SHADE_JSON" | jq -r '.pane_id')
    NAME=$(echo "$SHADE_JSON" | jq -r '.name')

    COLOR_JSON=$("$SCRIPT_DIR/color.sh" get "$NAME")
    COLOR=$(echo "$COLOR_JSON" | jq -r '.header')

    # Update registry status
    "$SCRIPT_DIR/registry.sh" update "$UUID" "status" "working"
    "$SCRIPT_DIR/registry.sh" update "$UUID" "current_task" "$TASK"
else
    # Direct mode
    PANE_ID="$1"
    NAME="$2"
    COLOR="$3"
    shift 3
    TASK="$*"

    if [ -z "$PANE_ID" ] || [ -z "$NAME" ] || [ -z "$COLOR" ]; then
        echo "Usage: title.sh <pane_id> <name> <color_hex> <task>" >&2
        exit 1
    fi
fi

tmux select-pane -t "$PANE_ID" -T "$NAME - $TASK"
