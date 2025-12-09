#!/bin/bash
# Smart layout for Iris tmux session
# Adapts layout based on number of panes
#
# Layout rules:
#   2 panes: master 60% | worker
#   3 panes: master 60% | worker1, worker2 (stacked)
#   4 panes: master 50% | col2 (2 stacked) | col3 (1 pane)
#   5 panes: master 50% | col2 (2 stacked) | col3 (2 stacked)
#   6 panes: master 50% | col2 (2 stacked) | col3 (3 stacked)
#
# Uses join-pane to create proper 3-column layouts

SESSION="${1:-iris}"

# Get pane count
PANE_COUNT=$(tmux list-panes -t "$SESSION" 2>/dev/null | wc -l)

if [ "$PANE_COUNT" -lt 2 ]; then
    exit 0
fi

# Get all pane IDs in order
PANES=($(tmux list-panes -t "$SESSION" -F '#{pane_id}'))
MASTER="${PANES[0]}"

case $PANE_COUNT in
    2)
        # Simple: master left 60%, worker right
        tmux select-layout -t "$SESSION" main-vertical
        tmux resize-pane -t "$MASTER" -x 60%
        ;;
    3)
        # Master left 60%, two workers stacked right
        tmux select-layout -t "$SESSION" main-vertical
        tmux resize-pane -t "$MASTER" -x 60%
        ;;
    4)
        # Master 50% | col2 (2 stacked) | col3 (1)
        # Start with all horizontal
        tmux select-layout -t "$SESSION" even-horizontal
        sleep 0.1

        # Stack pane 2 under pane 1 to create col2
        tmux join-pane -t "${PANES[1]}" -s "${PANES[2]}" -v
        sleep 0.1

        # Resize master to 50%
        tmux resize-pane -t "$MASTER" -x 50%
        sleep 0.1

        # Balance the right columns
        tmux resize-pane -t "${PANES[1]}" -x 25%
        ;;
    5)
        # Master 50% | col2 (2 stacked) | col3 (2 stacked)
        # 4 workers in 2x2 grid - all equal size
        tmux select-layout -t "$SESSION" even-horizontal
        sleep 0.1

        # Stack pane 2 under pane 1 (col2)
        tmux join-pane -t "${PANES[1]}" -s "${PANES[2]}" -v
        sleep 0.1

        # Stack pane 4 under pane 3 (col3)
        tmux join-pane -t "${PANES[3]}" -s "${PANES[4]}" -v
        sleep 0.1

        # Resize master to 50%
        tmux resize-pane -t "$MASTER" -x 50%
        sleep 0.1

        # Balance columns 2 and 3 (equal width)
        tmux resize-pane -t "${PANES[1]}" -x 25%
        sleep 0.1

        # Make all 4 workers equal height (half of window each)
        H=$(tmux display -t "$SESSION" -p '#{window_height}')
        HALF_H=$((H / 2))
        tmux resize-pane -t "${PANES[1]}" -y "$HALF_H"
        tmux resize-pane -t "${PANES[3]}" -y "$HALF_H"
        ;;
    6)
        # Master 50% | 5 workers in 2 columns
        # For equal sizing: col2 (2 workers) + col3 (3 workers)
        # Heights can't be perfectly equal, but we try to balance
        # Alternative: 3 rows × 2 cols but that requires different structure

        # Actually, let's do 2 rows with workers spread across
        # Row 1: 2 workers, Row 2: 3 workers - still unequal widths

        # Best approach for 5 workers: 2+3 split with equal heights per column
        tmux select-layout -t "$SESSION" even-horizontal
        sleep 0.1

        # Stack pane 2 under pane 1 (col2 - 2 workers)
        tmux join-pane -t "${PANES[1]}" -s "${PANES[2]}" -v
        sleep 0.1

        # Stack panes 4,5 under pane 3 (col3 - 3 workers)
        tmux join-pane -t "${PANES[3]}" -s "${PANES[4]}" -v
        sleep 0.1
        tmux join-pane -t "${PANES[4]}" -s "${PANES[5]}" -v
        sleep 0.1

        # Resize master to 50%
        tmux resize-pane -t "$MASTER" -x 50%
        sleep 0.1

        # Balance columns 2 and 3 (equal width)
        tmux resize-pane -t "${PANES[1]}" -x 25%
        sleep 0.1

        # Equalize heights within each column
        H=$(tmux display -t "$SESSION" -p '#{window_height}')
        HALF_H=$((H / 2))
        THIRD_H=$((H / 3))

        # Col2: 2 workers, each half height
        tmux resize-pane -t "${PANES[1]}" -y "$HALF_H"

        # Col3: 3 workers, each third height
        tmux resize-pane -t "${PANES[3]}" -y "$THIRD_H"
        tmux resize-pane -t "${PANES[4]}" -y "$THIRD_H"
        ;;
    7)
        # Master 50% | col2 (3 stacked) | col3 (3 stacked)
        tmux select-layout -t "$SESSION" even-horizontal
        sleep 0.1

        # Stack panes 2,3 under pane 1 (col2)
        tmux join-pane -t "${PANES[1]}" -s "${PANES[2]}" -v
        sleep 0.1
        tmux join-pane -t "${PANES[2]}" -s "${PANES[3]}" -v
        sleep 0.1

        # Stack panes 5,6 under pane 4 (col3)
        tmux join-pane -t "${PANES[4]}" -s "${PANES[5]}" -v
        sleep 0.1
        tmux join-pane -t "${PANES[5]}" -s "${PANES[6]}" -v
        sleep 0.1

        # Resize master to 50%
        tmux resize-pane -t "$MASTER" -x 50%
        sleep 0.1

        # Balance columns
        tmux resize-pane -t "${PANES[1]}" -x 25%
        ;;
    *)
        # 8+ panes: use tiled and resize master
        tmux select-layout -t "$SESSION" tiled
        tmux resize-pane -t "$MASTER" -x 45%
        ;;
esac

# Re-select master pane
tmux select-pane -t "$MASTER"
