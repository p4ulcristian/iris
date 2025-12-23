#!/bin/bash
# Kill current pane - args passed from tmux at key-press time
# Usage: kill-pane.sh <window_id> <pane_id> <pane_pid> <window_panes> <session_windows>

exec >/dev/null 2>&1

window_id="$1"
pane_id="$2"
pid="$3"
panes="$4"
windows="$5"

# Kill the process
kill -9 "$pid"

# Kill pane or window
if [ "$panes" -eq 1 ] && [ "$windows" -eq 1 ]; then
    tmux kill-pane -t "$pane_id"
elif [ "$panes" -eq 1 ]; then
    tmux kill-window -t "$window_id"
else
    tmux kill-pane -t "$pane_id"
fi
