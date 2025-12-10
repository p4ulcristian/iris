#!/bin/bash
# Layout manager for Iris tmux session
#
# Layout: Master (35% left) | Workers (65% right)
# Workers stack in columns based on count:
#   1-4 workers:  1 column
#   5-8 workers:  2 columns (smaller counts go left)
#   9-12 workers: 3 columns (smaller counts go left)
#
# Formula: cols = ceil(workers / 4)

SESSION="${1:-iris}"

# Get pane count and IDs
PANE_COUNT=$(tmux list-panes -t "$SESSION" 2>/dev/null | wc -l)
PANES=($(tmux list-panes -t "$SESSION" -F '#{pane_id}' 2>/dev/null))
MASTER="${PANES[0]}"

if [ "$PANE_COUNT" -lt 2 ]; then
    exit 0
fi

WORKER_COUNT=$((PANE_COUNT - 1))

# Calculate columns: ceil(workers / 4)
if [ "$WORKER_COUNT" -le 4 ]; then
    COLS=1
elif [ "$WORKER_COUNT" -le 8 ]; then
    COLS=2
else
    COLS=3
fi

# Start with main-vertical layout (master left, one pane right)
tmux select-layout -t "$SESSION" main-vertical
sleep 0.1

# Resize master to 35%
tmux resize-pane -t "$MASTER" -x 35%
sleep 0.1

if [ "$WORKER_COUNT" -eq 1 ]; then
    # Single worker, nothing more to do
    tmux select-pane -t "$MASTER"
    exit 0
fi

# Get window dimensions
WIN_HEIGHT=$(tmux display -t "$SESSION" -p '#{window_height}')

# Distribute workers into columns
# Smaller counts go to left columns
workers_per_col=()
remaining=$WORKER_COUNT

for ((c = COLS; c >= 1; c--)); do
    count=$((remaining / c))
    workers_per_col+=("$count")
    remaining=$((remaining - count))
done

# Build list of workers (panes 1..n)
workers=("${PANES[@]:1}")

# Create column structure
# First, we need to split the right side into columns if COLS > 1
if [ "$COLS" -eq 1 ]; then
    # All workers stack vertically in single column
    # First worker is already in position (pane 1)
    # Join remaining workers below it
    col_base="${workers[0]}"
    for ((i = 1; i < WORKER_COUNT; i++)); do
        tmux join-pane -t "$col_base" -s "${workers[$i]}" -v
        sleep 0.05
    done

    # Equalize heights
    row_height=$((WIN_HEIGHT / WORKER_COUNT))
    for ((i = 0; i < WORKER_COUNT - 1; i++)); do
        tmux resize-pane -t "${workers[$i]}" -y "$row_height"
        sleep 0.05
    done

elif [ "$COLS" -eq 2 ]; then
    # Split into 2 columns
    left_count=${workers_per_col[0]}
    right_count=${workers_per_col[1]}

    # Left column workers: indices 0 to left_count-1
    # Right column workers: indices left_count to end

    left_workers=("${workers[@]:0:$left_count}")
    right_workers=("${workers[@]:$left_count:$right_count}")

    # First left worker is already the first worker pane
    left_base="${left_workers[0]}"

    # Create right column by splitting first worker horizontally
    right_base="${right_workers[0]}"
    tmux move-pane -t "$left_base" -s "$right_base" -h
    sleep 0.05

    # Stack remaining left workers below the left base
    for ((i = 1; i < left_count; i++)); do
        tmux join-pane -t "$left_base" -s "${left_workers[$i]}" -v
        sleep 0.05
    done

    # Stack remaining right workers below the right base
    for ((i = 1; i < right_count; i++)); do
        tmux join-pane -t "$right_base" -s "${right_workers[$i]}" -v
        sleep 0.05
    done

    # Equalize heights within columns
    if [ "$left_count" -gt 1 ]; then
        row_height=$((WIN_HEIGHT / left_count))
        for ((i = 0; i < left_count - 1; i++)); do
            tmux resize-pane -t "${left_workers[$i]}" -y "$row_height"
            sleep 0.05
        done
    fi

    if [ "$right_count" -gt 1 ]; then
        row_height=$((WIN_HEIGHT / right_count))
        for ((i = 0; i < right_count - 1; i++)); do
            tmux resize-pane -t "${right_workers[$i]}" -y "$row_height"
            sleep 0.05
        done
    fi

    # Balance column widths (each gets half of the 65% worker area)
    WIN_WIDTH=$(tmux display -t "$SESSION" -p '#{window_width}')
    col_width=$(( (WIN_WIDTH * 65 / 100) / 2 ))
    tmux resize-pane -t "$left_base" -x "$col_width"
    sleep 0.05

elif [ "$COLS" -eq 3 ]; then
    # Split into 3 columns
    left_count=${workers_per_col[0]}
    mid_count=${workers_per_col[1]}
    right_count=${workers_per_col[2]}

    left_workers=("${workers[@]:0:$left_count}")
    mid_workers=("${workers[@]:$left_count:$mid_count}")
    right_workers=("${workers[@]:$((left_count + mid_count)):$right_count}")

    left_base="${left_workers[0]}"
    mid_base="${mid_workers[0]}"
    right_base="${right_workers[0]}"

    # Create middle column
    tmux move-pane -t "$left_base" -s "$mid_base" -h
    sleep 0.05

    # Create right column
    tmux move-pane -t "$mid_base" -s "$right_base" -h
    sleep 0.05

    # Stack remaining workers in each column
    for ((i = 1; i < left_count; i++)); do
        tmux join-pane -t "$left_base" -s "${left_workers[$i]}" -v
        sleep 0.05
    done

    for ((i = 1; i < mid_count; i++)); do
        tmux join-pane -t "$mid_base" -s "${mid_workers[$i]}" -v
        sleep 0.05
    done

    for ((i = 1; i < right_count; i++)); do
        tmux join-pane -t "$right_base" -s "${right_workers[$i]}" -v
        sleep 0.05
    done

    # Equalize heights within columns
    if [ "$left_count" -gt 1 ]; then
        row_height=$((WIN_HEIGHT / left_count))
        for ((i = 0; i < left_count - 1; i++)); do
            tmux resize-pane -t "${left_workers[$i]}" -y "$row_height"
            sleep 0.05
        done
    fi

    if [ "$mid_count" -gt 1 ]; then
        row_height=$((WIN_HEIGHT / mid_count))
        for ((i = 0; i < mid_count - 1; i++)); do
            tmux resize-pane -t "${mid_workers[$i]}" -y "$row_height"
            sleep 0.05
        done
    fi

    if [ "$right_count" -gt 1 ]; then
        row_height=$((WIN_HEIGHT / right_count))
        for ((i = 0; i < right_count - 1; i++)); do
            tmux resize-pane -t "${right_workers[$i]}" -y "$row_height"
            sleep 0.05
        done
    fi

    # Balance column widths (each gets 1/3 of the 65% worker area)
    WIN_WIDTH=$(tmux display -t "$SESSION" -p '#{window_width}')
    col_width=$(( (WIN_WIDTH * 65 / 100) / 3 ))
    tmux resize-pane -t "$left_base" -x "$col_width"
    sleep 0.05
    tmux resize-pane -t "$mid_base" -x "$col_width"
    sleep 0.05
fi

# Re-select master pane
tmux select-pane -t "$MASTER"
