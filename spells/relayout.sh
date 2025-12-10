#!/bin/bash
# Restructure Iris tmux layout without killing processes
#
# Uses break-pane/join-pane to detach workers from the pane tree,
# then rebuilds the structure correctly. Processes survive intact.
#
# Layout: Master (35% left) | Workers stacked vertically (65% right)
#
# Usage: relayout.sh [session]

set -e

SESSION="${1:-iris}"

# Get all panes in window 0 - first pane is always master
ALL_PANES=($(tmux list-panes -t "$SESSION:0" -F '#{pane_id}' 2>/dev/null))
MASTER="${ALL_PANES[0]}"

if [ ${#ALL_PANES[@]} -lt 2 ]; then
    # Only master or empty - nothing to restructure
    exit 0
fi

# Workers are all panes except the first (master)
WORKERS=("${ALL_PANES[@]:1}")

if [ ${#WORKERS[@]} -eq 0 ]; then
    exit 0
fi

echo "Restructuring ${#WORKERS[@]} worker pane(s)..."

# Phase 1: Break all workers to temporary windows
# Use unique prefix to avoid collisions
TEMP_PREFIX="iris_relayout_$$"
declare -a TEMP_NAMES

for i in "${!WORKERS[@]}"; do
    pane="${WORKERS[$i]}"
    temp_name="${TEMP_PREFIX}_${i}"
    TEMP_NAMES+=("$temp_name")

    # Break pane to new window with -d (don't switch to it)
    tmux break-pane -d -s "$pane" -t "$SESSION:" -n "$temp_name" 2>/dev/null || {
        echo "Error: Failed to break pane $pane" >&2
        exit 1
    }
done

# Phase 2: Rebuild structure by joining back
# First worker: join horizontally to right of master
tmux join-pane -h -d -s "$SESSION:${TEMP_NAMES[0]}.0" -t "$SESSION:0.0" 2>/dev/null || {
    echo "Error: Failed to join first worker" >&2
    exit 1
}

# Remaining workers: join vertically below previous
for i in $(seq 1 $((${#WORKERS[@]} - 1))); do
    target_idx=$i  # Join below the pane at this index
    tmux join-pane -v -d -s "$SESSION:${TEMP_NAMES[$i]}.0" -t "$SESSION:0.$target_idx" 2>/dev/null || {
        echo "Error: Failed to join worker $i" >&2
        exit 1
    }
done

# Phase 3: Resize master to 35%
WIN_WIDTH=$(tmux display -t "$SESSION:0" -p '#{window_width}')
MASTER_WIDTH=$((WIN_WIDTH * 35 / 100))
tmux resize-pane -t "$SESSION:0.0" -x "$MASTER_WIDTH" 2>/dev/null

# Phase 4: Equalize worker heights
WORKER_COUNT=${#WORKERS[@]}
if [ "$WORKER_COUNT" -gt 1 ]; then
    WIN_HEIGHT=$(tmux display -t "$SESSION:0" -p '#{window_height}')
    # Account for pane borders (1 line each between panes)
    BORDERS=$((WORKER_COUNT - 1))
    AVAILABLE_HEIGHT=$((WIN_HEIGHT - BORDERS))
    WORKER_HEIGHT=$((AVAILABLE_HEIGHT / WORKER_COUNT))

    # Resize each worker (except last which gets remainder)
    for i in $(seq 1 $((WORKER_COUNT - 1))); do
        tmux resize-pane -t "$SESSION:0.$i" -y "$WORKER_HEIGHT" 2>/dev/null
    done
fi

# Select master pane
tmux select-pane -t "$SESSION:0.0"

echo "Layout restructured: Master (35%) | ${#WORKERS[@]} workers stacked"
