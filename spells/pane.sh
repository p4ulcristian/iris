#!/bin/bash
# Tmux pane operations
# Usage:
#   pane.sh create [command]   - Create new pane, output pane_id
#   pane.sh kill <pane_id>     - Kill a pane
#   pane.sh list               - List all non-master panes

SESSION="iris"

case "$1" in
    create)
        shift
        CMD="${*:-bash}"
        tmux split-window -t "$SESSION" -h -d -P -F '#{pane_id}' bash -c "$CMD"
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
