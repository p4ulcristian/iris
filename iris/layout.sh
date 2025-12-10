#!/bin/bash
# Change tmux pane layout for Iris session
# Usage: layout.sh [style]
#
# Styles:
#   main/default  - Master large on left, workers stacked right (default)
#   even/equal    - All panes evenly distributed horizontally
#   tiled/grid    - Grid layout for 4+ workers
#   stacked       - Master on top, workers in row below
#   focus         - Maximize master, minimize workers

STYLE="${1:-main}"

case "$STYLE" in
    main|default|"")
        tmux select-layout -t iris main-vertical
        tmux resize-pane -t iris:0.0 -x 60%
        echo "main"
        ;;
    even|equal)
        tmux select-layout -t iris even-horizontal
        echo "even"
        ;;
    tiled|grid)
        tmux select-layout -t iris tiled
        echo "tiled"
        ;;
    stacked)
        tmux select-layout -t iris main-horizontal
        tmux resize-pane -t iris:0.0 -y 60%
        echo "stacked"
        ;;
    focus)
        tmux select-layout -t iris main-vertical
        tmux resize-pane -t iris:0.0 -x 80%
        echo "focus"
        ;;
    *)
        echo "Unknown layout: $STYLE"
        echo "Options: main, even, tiled, stacked, focus"
        exit 1
        ;;
esac
