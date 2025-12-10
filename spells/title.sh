#!/bin/bash
# Set shade pane title
# Usage:
#   title.sh <uuid> <task>                          - Shade updates its displayed task
#   title.sh iris <task>                            - Iris mode (targets main pane)
#
# Note: The pane title stores metadata (Name|uuid|project)
# This script updates a "current_task.txt" in shadows/ for display purposes

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IRIS_DIR="$HOME/Iris"
SHADOWS_DIR="$IRIS_DIR/shadows"

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

# UUID mode - shade updating its task
if [[ "$1" =~ ^[a-z]+-[0-9]{8}-[0-9]{6}-[a-f0-9]{4}$ ]]; then
    UUID="$1"
    shift
    TASK="$*"

    # Find pane by UUID in tmux titles
    PANE_ID=""
    NAME=""
    while IFS=: read -r pid title; do
        [[ "$title" != *"|"* ]] && continue
        IFS='|' read -r n u p <<< "$title"
        if [[ "$u" == "$UUID" ]]; then
            PANE_ID="$pid"
            NAME="$n"
            break
        fi
    done < <(tmux list-panes -t iris -F '#{pane_id}:#{pane_title}' 2>/dev/null)

    if [ -z "$PANE_ID" ]; then
        echo "Shade '$UUID' not found" >&2
        exit 1
    fi

    # Store current task in shadows folder
    SHADOW_DIR="$SHADOWS_DIR/$UUID"
    if [ -d "$SHADOW_DIR" ]; then
        echo "$TASK" > "$SHADOW_DIR/current_task.txt"
    fi

    # The pane title keeps the metadata - we can't change it without breaking lookups
    # But we could optionally update it for visual purposes if desired
    # For now, the task display comes from shadows/uuid/current_task.txt

    exit 0
fi

echo "Usage: title.sh <uuid> <task>  OR  title.sh iris <task>" >&2
exit 1
