#!/bin/bash
# Tmux pane operations
# Usage:
#   pane.sh create [command]   - Create new pane, output pane_id
#   pane.sh kill <pane_id>     - Kill a pane
#   pane.sh list               - List all non-master panes
#
# Layout strategy:
#   - Master (%0) stays on the left (35%)
#   - Workers fill the right side (65%)
#   - Workers stack vertically, up to 4 per column
#   - When a column is full, split horizontally to create new column

SESSION="iris"
MASTER="%0"
MAX_PER_COLUMN=4

case "$1" in
    create)
        shift
        CMD="${*:-bash}"

        # Get current worker panes (excluding master)
        WORKERS=($(tmux list-panes -t "$SESSION" -F '#{pane_id}' 2>/dev/null | grep -v "^${MASTER}$"))
        WORKER_COUNT=${#WORKERS[@]}

        if [ "$WORKER_COUNT" -eq 0 ]; then
            # First worker: split horizontally from master
            tmux split-window -t "$MASTER" -h -d -P -F '#{pane_id}' bash -c "$CMD"
        else
            # Find the rightmost column and count panes in it
            # Get pane positions to find columns
            declare -A COLUMNS  # column_x -> count
            RIGHTMOST_X=0
            RIGHTMOST_PANE=""

            for pane in "${WORKERS[@]}"; do
                pane_left=$(tmux display -t "$pane" -p '#{pane_left}' 2>/dev/null)
                if [ -n "$pane_left" ]; then
                    COLUMNS[$pane_left]=$((${COLUMNS[$pane_left]:-0} + 1))
                    if [ "$pane_left" -ge "$RIGHTMOST_X" ]; then
                        RIGHTMOST_X=$pane_left
                        # Track the topmost pane in rightmost column for horizontal split
                        pane_top=$(tmux display -t "$pane" -p '#{pane_top}' 2>/dev/null)
                        if [ -z "$RIGHTMOST_PANE" ] || [ "$pane_top" -lt "$(tmux display -t "$RIGHTMOST_PANE" -p '#{pane_top}')" ]; then
                            RIGHTMOST_PANE="$pane"
                        fi
                    fi
                fi
            done

            RIGHTMOST_COUNT=${COLUMNS[$RIGHTMOST_X]:-0}

            if [ "$RIGHTMOST_COUNT" -lt "$MAX_PER_COLUMN" ]; then
                # Room in current column: split vertically from bottom pane of rightmost column
                # Find bottom pane in rightmost column
                BOTTOM_PANE=""
                BOTTOM_TOP=0
                for pane in "${WORKERS[@]}"; do
                    pane_left=$(tmux display -t "$pane" -p '#{pane_left}' 2>/dev/null)
                    if [ "$pane_left" = "$RIGHTMOST_X" ]; then
                        pane_top=$(tmux display -t "$pane" -p '#{pane_top}' 2>/dev/null)
                        if [ "$pane_top" -gt "$BOTTOM_TOP" ]; then
                            BOTTOM_TOP=$pane_top
                            BOTTOM_PANE="$pane"
                        fi
                    fi
                done
                tmux split-window -t "$BOTTOM_PANE" -v -d -P -F '#{pane_id}' bash -c "$CMD"
            else
                # Column full: split horizontally from rightmost column to create new column
                tmux split-window -t "$RIGHTMOST_PANE" -h -d -P -F '#{pane_id}' bash -c "$CMD"
            fi
        fi
        ;;
    kill)
        PANE_ID="$2"
        if [ -z "$PANE_ID" ]; then
            echo "Usage: pane.sh kill <pane_id>" >&2
            exit 1
        fi
        if [ "$PANE_ID" = "%0" ]; then
            echo "Cannot kill master pane" >&2
            exit 1
        fi
        tmux kill-pane -t "$PANE_ID"
        ;;
    list)
        tmux list-panes -t "$SESSION" -F '#{pane_id}' 2>/dev/null | grep -v '^%0$'
        ;;
    *)
        echo "Usage: pane.sh <create|kill|list>" >&2
        exit 1
        ;;
esac
