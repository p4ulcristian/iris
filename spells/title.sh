#!/bin/bash
# Set shade pane title and status
# Usage:
#   title.sh <uuid> <task>                          - Shade updates its displayed task
#   title.sh <uuid> --status <status>               - Update shade status only
#   title.sh iris <task>                            - Iris mode (targets main pane)
#
# Status icons:
#   laboring  ▶  (working)
#   dormant   ◉  (idle)
#   fulfilled ✦  (done)
#   scattered ⚡ (crashed)
#
# Note: The pane title stores metadata (Name|uuid|project)
# Task/status stored in shadows/<uuid>/ for display purposes

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IRIS_DIR="$HOME/Iris"
SHADOWS_DIR="$IRIS_DIR/shadows"

# Handle Iris special case
if [[ "$1" == "iris" ]]; then
    shift
    TASK="$*"
    if [ -z "$TASK" ]; then
        tmux select-pane -t "iris:0.0" -T "𓂀 Iris"
    else
        tmux select-pane -t "iris:0.0" -T "𓂀 Iris - $TASK"
    fi
    exit 0
fi

# Status icon mapping
get_status_icon() {
    case "$1" in
        laboring|working|busy) echo "▶" ;;
        dormant|idle)          echo "◉" ;;
        fulfilled|done)        echo "✦" ;;
        scattered|crashed)     echo "⚡" ;;
        *)                     echo "▶" ;;  # default to laboring
    esac
}

# UUID mode - shade updating its task or status
if [[ "$1" =~ ^[a-z]+-[0-9]{8}-[0-9]{6}-[a-f0-9]{4}$ ]]; then
    UUID="$1"
    shift

    # Check for --status flag
    if [[ "$1" == "--status" ]]; then
        shift
        STATUS="$1"
        SHADOW_DIR="$SHADOWS_DIR/$UUID"
        if [ -d "$SHADOW_DIR" ]; then
            echo "$STATUS" > "$SHADOW_DIR/status.txt"
        fi
        exit 0
    fi

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

    # Store current task in shadows folder and set status to laboring
    SHADOW_DIR="$SHADOWS_DIR/$UUID"
    if [ -d "$SHADOW_DIR" ]; then
        echo "$TASK" > "$SHADOW_DIR/current_task.txt"
        echo "laboring" > "$SHADOW_DIR/status.txt"
    fi

    exit 0
fi

echo "Usage: title.sh <uuid> <task>  OR  title.sh iris <task>" >&2
exit 1
