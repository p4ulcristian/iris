#!/bin/bash
# Tmux pane operations
# Usage:
#   pane.sh create [command]   - Create new pane, output pane_id
#   pane.sh kill <pane_id>     - Kill a pane
#   pane.sh list               - List all non-master panes
#
# Note: layout.sh handles all positioning after create/kill

SESSION="iris"

# Find master pane by title containing "Iris" (not hardcoded %0)
find_master() {
    while IFS=$'\t' read -r pane_id pane_title; do
        if [[ "${pane_title,,}" == *"iris"* ]]; then
            echo "$pane_id"
            return 0
        fi
    done < <(tmux list-panes -t "$SESSION" -F '#{pane_id}	#{pane_title}' 2>/dev/null)
    # Fallback to %0 if no Iris pane found
    echo "%0"
}

case "$1" in
    create)
        shift
        CMD="${*:-bash}"
        MASTER=$(find_master)
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

        # Get current worker panes (excluding master)
        WORKERS=($(tmux list-panes -t "$SESSION" -F '#{pane_id}' 2>/dev/null | grep -v "^${MASTER}$"))

        try_split() {
            if [ ${#WORKERS[@]} -eq 0 ]; then
                # First worker: split horizontally from master
                tmux split-window -t "$MASTER" -h -d -P -F '#{pane_id}' bash -c "$CMD" 2>&1
            else
                # Split from last worker (layout.sh will fix positioning)
                LAST="${WORKERS[-1]}"
                tmux split-window -t "$LAST" -v -d -P -F '#{pane_id}' bash -c "$CMD" 2>&1
            fi
        }

        RESULT=$(try_split)

        # If no space, run layout to reorganize, then retry
        if [[ "$RESULT" == *"no space"* ]]; then
            "$SCRIPT_DIR/layout.sh" "$SESSION" 2>/dev/null
            # Re-find master and workers after layout
            MASTER=$(find_master)
            WORKERS=($(tmux list-panes -t "$SESSION" -F '#{pane_id}' 2>/dev/null | grep -v "^${MASTER}$"))
            RESULT=$(try_split)
        fi

        # Output the pane ID (filter out any error messages)
        echo "$RESULT" | grep -E '^%[0-9]+$' || echo "$RESULT"
        ;;
    kill)
        PANE_ID="$2"
        if [ -z "$PANE_ID" ]; then
            echo "Usage: pane.sh kill <pane_id>" >&2
            exit 1
        fi
        MASTER=$(find_master)
        if [ "$PANE_ID" = "$MASTER" ]; then
            echo "Cannot kill master pane" >&2
            exit 1
        fi
        tmux kill-pane -t "$PANE_ID"
        ;;
    list)
        MASTER=$(find_master)
        tmux list-panes -t "$SESSION" -F '#{pane_id}' 2>/dev/null | grep -v "^${MASTER}$"
        ;;
    *)
        echo "Usage: pane.sh <create|kill|list>" >&2
        exit 1
        ;;
esac
