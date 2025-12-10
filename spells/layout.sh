#!/bin/bash
# Layout manager for Iris tmux session
# Usage: layout.sh [style]
#
# Styles:
#   auto (default) - Smart layout based on pane count
#   even           - All panes evenly distributed horizontally
#   tiled          - Grid layout for many panes
#   stacked        - Master on top, workers in row below
#   focus          - Maximize master, minimize workers

SESSION="${1:-iris}"
STYLE="${2:-auto}"

# If only one arg and it's a style keyword, use it
if [[ "$1" =~ ^(auto|even|tiled|stacked|focus)$ ]]; then
    STYLE="$1"
    SESSION="iris"
fi

# Get pane count and IDs
PANE_COUNT=$(tmux list-panes -t "$SESSION" 2>/dev/null | wc -l)
PANES=($(tmux list-panes -t "$SESSION" -F '#{pane_id}' 2>/dev/null))
MASTER="${PANES[0]}"

if [ "$PANE_COUNT" -lt 2 ]; then
    exit 0
fi

case "$STYLE" in
    even)
        tmux select-layout -t "$SESSION" even-horizontal
        ;;
    tiled)
        tmux select-layout -t "$SESSION" tiled
        ;;
    stacked)
        tmux select-layout -t "$SESSION" main-horizontal
        tmux resize-pane -t "$MASTER" -y 60%
        ;;
    focus)
        tmux select-layout -t "$SESSION" main-vertical
        tmux resize-pane -t "$MASTER" -x 80%
        ;;
    auto|*)
        # Smart layout based on pane count
        case $PANE_COUNT in
            2)
                tmux select-layout -t "$SESSION" main-vertical
                tmux resize-pane -t "$MASTER" -x 60%
                ;;
            3)
                tmux select-layout -t "$SESSION" main-vertical
                tmux resize-pane -t "$MASTER" -x 60%
                ;;
            4)
                tmux select-layout -t "$SESSION" even-horizontal
                sleep 0.1
                tmux join-pane -t "${PANES[1]}" -s "${PANES[2]}" -v
                sleep 0.1
                tmux resize-pane -t "$MASTER" -x 50%
                sleep 0.1
                tmux resize-pane -t "${PANES[1]}" -x 25%
                ;;
            5)
                tmux select-layout -t "$SESSION" even-horizontal
                sleep 0.1
                tmux join-pane -t "${PANES[1]}" -s "${PANES[2]}" -v
                sleep 0.1
                tmux join-pane -t "${PANES[3]}" -s "${PANES[4]}" -v
                sleep 0.1
                tmux resize-pane -t "$MASTER" -x 50%
                sleep 0.1
                tmux resize-pane -t "${PANES[1]}" -x 25%
                sleep 0.1
                H=$(tmux display -t "$SESSION" -p '#{window_height}')
                HALF_H=$((H / 2))
                tmux resize-pane -t "${PANES[1]}" -y "$HALF_H"
                tmux resize-pane -t "${PANES[3]}" -y "$HALF_H"
                ;;
            6)
                tmux select-layout -t "$SESSION" even-horizontal
                sleep 0.1
                tmux join-pane -t "${PANES[1]}" -s "${PANES[2]}" -v
                sleep 0.1
                tmux join-pane -t "${PANES[3]}" -s "${PANES[4]}" -v
                sleep 0.1
                tmux join-pane -t "${PANES[4]}" -s "${PANES[5]}" -v
                sleep 0.1
                tmux resize-pane -t "$MASTER" -x 50%
                sleep 0.1
                tmux resize-pane -t "${PANES[1]}" -x 25%
                sleep 0.1
                H=$(tmux display -t "$SESSION" -p '#{window_height}')
                HALF_H=$((H / 2))
                THIRD_H=$((H / 3))
                tmux resize-pane -t "${PANES[1]}" -y "$HALF_H"
                tmux resize-pane -t "${PANES[3]}" -y "$THIRD_H"
                tmux resize-pane -t "${PANES[4]}" -y "$THIRD_H"
                ;;
            7)
                tmux select-layout -t "$SESSION" even-horizontal
                sleep 0.1
                tmux join-pane -t "${PANES[1]}" -s "${PANES[2]}" -v
                sleep 0.1
                tmux join-pane -t "${PANES[2]}" -s "${PANES[3]}" -v
                sleep 0.1
                tmux join-pane -t "${PANES[4]}" -s "${PANES[5]}" -v
                sleep 0.1
                tmux join-pane -t "${PANES[5]}" -s "${PANES[6]}" -v
                sleep 0.1
                tmux resize-pane -t "$MASTER" -x 50%
                sleep 0.1
                tmux resize-pane -t "${PANES[1]}" -x 25%
                ;;
            *)
                tmux select-layout -t "$SESSION" tiled
                tmux resize-pane -t "$MASTER" -x 45%
                ;;
        esac
        ;;
esac

# Re-select master pane
tmux select-pane -t "$MASTER"
