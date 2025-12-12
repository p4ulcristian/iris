#!/bin/bash
# Layout manager for Iris tmux session
#
# Layout: Iris (40% left) | Workers in grid (60% right)
#
# Worker patterns by count:
#   1-3:  single column (stacked)
#   4-6:  2 columns (2x2, 3x2, 3x3)
#   7+:   3 columns
#
# Usage: layout.sh [session]

SESSION="${1:-iris}"

find_master() {
    while IFS=$'\t' read -r pane_id pane_title; do
        if [[ "${pane_title,,}" == *"iris"* ]]; then
            echo "$pane_id"
            return 0
        fi
    done < <(tmux list-panes -t "$SESSION:0" -F '#{pane_id}	#{pane_title}' 2>/dev/null)
    tmux list-panes -t "$SESSION:0" -F '#{pane_id}' 2>/dev/null | head -1
}

MASTER=$(find_master)
[ -z "$MASTER" ] && exit 0

PANE_COUNT=$(tmux list-panes -t "$SESSION:0" 2>/dev/null | wc -l)
[ "$PANE_COUNT" -lt 2 ] && { tmux select-pane -t "$MASTER"; exit 0; }

# Ensure master is first pane
FIRST_PANE=$(tmux list-panes -t "$SESSION:0" -F '#{pane_id}' | head -1)
if [ "$MASTER" != "$FIRST_PANE" ]; then
    tmux swap-pane -s "$MASTER" -t "$FIRST_PANE"
    MASTER="$FIRST_PANE"
fi

WORKER_COUNT=$((PANE_COUNT - 1))

# Get window dimensions
WIN_WIDTH=$(tmux display -t "$SESSION:0" -p '#{window_width}')
WIN_HEIGHT=$(tmux display -t "$SESSION:0" -p '#{window_height}')
MASTER_WIDTH=$((WIN_WIDTH * 40 / 100))

# For 1-3 workers: simple main-vertical
if [ "$WORKER_COUNT" -le 3 ]; then
    tmux select-layout -t "$SESSION:0" main-vertical
    tmux resize-pane -t "$SESSION:0.0" -x "$MASTER_WIDTH" 2>/dev/null
    tmux select-pane -t "$MASTER"
    exit 0
fi

# For 4+ workers: build grid using break/join
# Step 1: Get all workers and break them to temp windows
WORKERS=($(tmux list-panes -t "$SESSION:0" -F '#{pane_id}' | grep -v "^${MASTER}$"))

TEMP_PREFIX="iris_grid_$$"
declare -a TEMP_WINS

for i in "${!WORKERS[@]}"; do
    pane="${WORKERS[$i]}"
    temp_name="${TEMP_PREFIX}_${i}"
    TEMP_WINS+=("$temp_name")
    tmux break-pane -d -s "$pane" -t "$SESSION:" -n "$temp_name" 2>/dev/null
done

# Determine grid layout
if [ "$WORKER_COUNT" -le 6 ]; then
    NUM_COLS=2
    col1_count=$(( (WORKER_COUNT + 1) / 2 ))
    col2_count=$((WORKER_COUNT - col1_count))
else
    NUM_COLS=3
    col1_count=$(( (WORKER_COUNT + 2) / 3 ))
    col2_count=$(( (WORKER_COUNT - col1_count + 1) / 2 ))
    col3_count=$((WORKER_COUNT - col1_count - col2_count))
fi

# Step 2: Rebuild grid structure
# Join first worker horizontally to master (creates column 1)
tmux join-pane -h -d -s "$SESSION:${TEMP_WINS[0]}.0" -t "$MASTER"
COL1_TOP=$(tmux list-panes -t "$SESSION:0" -F '#{pane_id}' | grep -v "^${MASTER}$" | head -1)

worker_idx=1

# If 2+ columns, create column 2 by splitting from col1
if [ "$NUM_COLS" -ge 2 ] && [ "$col1_count" -lt "$WORKER_COUNT" ]; then
    col2_first_idx=$col1_count
    if [ $col2_first_idx -lt $WORKER_COUNT ]; then
        # Join col2 first worker horizontally to col1 top
        tmux join-pane -h -d -s "$SESSION:${TEMP_WINS[$col2_first_idx]}.0" -t "$COL1_TOP"
        COL2_TOP=$(tmux list-panes -t "$SESSION:0" -F '#{pane_id} #{pane_left}' | sort -k2 -rn | head -1 | cut -d' ' -f1)
    fi
fi

# If 3 columns, create column 3
if [ "$NUM_COLS" -ge 3 ]; then
    col3_first_idx=$((col1_count + col2_count))
    if [ $col3_first_idx -lt $WORKER_COUNT ]; then
        tmux join-pane -h -d -s "$SESSION:${TEMP_WINS[$col3_first_idx]}.0" -t "$COL2_TOP"
        COL3_TOP=$(tmux list-panes -t "$SESSION:0" -F '#{pane_id} #{pane_left}' | sort -k2 -rn | head -1 | cut -d' ' -f1)
    fi
fi

# Now fill in remaining workers in each column (vertically)
# Column 1: workers 1 to (col1_count-1)
for i in $(seq 1 $((col1_count - 1))); do
    [ $i -ge $WORKER_COUNT ] && break
    # Get bottommost pane in col1
    col1_x=$(tmux display -p -t "$COL1_TOP" '#{pane_left}')
    col1_bottom=$(tmux list-panes -t "$SESSION:0" -F '#{pane_id} #{pane_left} #{pane_top}' | \
        awk -v x="$col1_x" '$2==x' | sort -k3 -rn | head -1 | cut -d' ' -f1)
    tmux join-pane -v -d -s "$SESSION:${TEMP_WINS[$i]}.0" -t "$col1_bottom"
done

# Column 2: workers col1_count+1 to col1_count+col2_count-1
if [ "$NUM_COLS" -ge 2 ]; then
    for i in $(seq $((col1_count + 1)) $((col1_count + col2_count - 1))); do
        [ $i -ge $WORKER_COUNT ] && break
        col2_x=$(tmux display -p -t "$COL2_TOP" '#{pane_left}')
        col2_bottom=$(tmux list-panes -t "$SESSION:0" -F '#{pane_id} #{pane_left} #{pane_top}' | \
            awk -v x="$col2_x" '$2==x' | sort -k3 -rn | head -1 | cut -d' ' -f1)
        tmux join-pane -v -d -s "$SESSION:${TEMP_WINS[$i]}.0" -t "$col2_bottom"
    done
fi

# Column 3: remaining workers
if [ "$NUM_COLS" -ge 3 ]; then
    for i in $(seq $((col1_count + col2_count + 1)) $((WORKER_COUNT - 1))); do
        [ $i -ge $WORKER_COUNT ] && break
        col3_x=$(tmux display -p -t "$COL3_TOP" '#{pane_left}')
        col3_bottom=$(tmux list-panes -t "$SESSION:0" -F '#{pane_id} #{pane_left} #{pane_top}' | \
            awk -v x="$col3_x" '$2==x' | sort -k3 -rn | head -1 | cut -d' ' -f1)
        tmux join-pane -v -d -s "$SESSION:${TEMP_WINS[$i]}.0" -t "$col3_bottom"
    done
fi

# Step 3: Resize
# Resize master to 40%
MASTER=$(find_master)
tmux resize-pane -t "$MASTER" -x "$MASTER_WIDTH" 2>/dev/null

# Equalize column widths
WORKER_WIDTH=$((WIN_WIDTH - MASTER_WIDTH - 1))
COL_WIDTH=$((WORKER_WIDTH / NUM_COLS))

# Resize col1
[ -n "$COL1_TOP" ] && tmux resize-pane -t "$COL1_TOP" -x "$COL_WIDTH" 2>/dev/null

# Resize col2 for 3-column layouts
if [ "$NUM_COLS" -eq 3 ] && [ -n "$COL2_TOP" ]; then
    tmux resize-pane -t "$COL2_TOP" -x "$COL_WIDTH" 2>/dev/null
fi

# Step 4: Equalize heights within each column
equalize_column_heights() {
    local col_x=$1
    local tolerance=5

    # Get all panes in this column (within tolerance of x position)
    local col_panes=($(tmux list-panes -t "$SESSION:0" -F '#{pane_id} #{pane_left}' | \
        awk -v x="$col_x" -v t="$tolerance" '$2 >= x-t && $2 <= x+t {print $1}'))

    local pane_count=${#col_panes[@]}
    [ "$pane_count" -le 1 ] && return

    # Calculate target height (window height / panes, accounting for borders)
    local available_height=$((WIN_HEIGHT - pane_count + 1))
    local target_height=$((available_height / pane_count))

    # Resize all but last pane (last gets remaining space)
    for i in $(seq 0 $((pane_count - 2))); do
        tmux resize-pane -t "${col_panes[$i]}" -y "$target_height" 2>/dev/null
    done
}

# Equalize heights in each column
[ -n "$COL1_TOP" ] && equalize_column_heights "$(tmux display -p -t "$COL1_TOP" '#{pane_left}')"
[ -n "$COL2_TOP" ] && equalize_column_heights "$(tmux display -p -t "$COL2_TOP" '#{pane_left}')"
[ -n "$COL3_TOP" ] && equalize_column_heights "$(tmux display -p -t "$COL3_TOP" '#{pane_left}')"

tmux select-pane -t "$MASTER"
