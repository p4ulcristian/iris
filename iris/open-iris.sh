#!/bin/bash
# Open or focus Iris tmux session

SESSION="Iris"

# Iris theme colors
IRIS_HEADER="#c9b1d4"  # Silver-violet
IRIS_BG="#1f1a28"      # Nebula

# Check if session exists
if ! tmux has-session -t $SESSION 2>/dev/null; then
    # Create new session
    tmux new-session -d -s $SESSION

    # Set up status bar as header (top, full-width, left-aligned)
    tmux set-option -t $SESSION status on
    tmux set-option -t $SESSION status-position top
    tmux set-option -t $SESSION status-style "bg=$IRIS_HEADER,fg=#000000"
    tmux set-option -t $SESSION status-left " Iris "
    tmux set-option -t $SESSION status-left-length 50
    tmux set-option -t $SESSION status-left-style "bg=$IRIS_HEADER,fg=#000000"
    tmux set-option -t $SESSION status-right ""
    tmux set-option -t $SESSION status-right-style "bg=$IRIS_HEADER,fg=#000000"
    tmux set-option -t $SESSION window-status-format ""
    tmux set-option -t $SESSION window-status-current-format ""

    # Set pane background to Nebula
    tmux select-pane -t $SESSION -P "bg=$IRIS_BG"

    # Prevent Claude Code from overwriting titles
    tmux set-option -t $SESSION allow-set-title off

    tmux send-keys -t $SESSION "cd ~/Think && claude --dangerously-skip-permissions" Enter
    sleep 1
fi

# Check if Ghostty with Iris is already open
if pgrep -f "ghostty.*tmux attach.*Iris" > /dev/null; then
    # Focus existing window using hyprctl
    hyprctl dispatch focuswindow "class:com.mitchellh.ghostty"
else
    # Open new Ghostty attached to session
    ghostty -e tmux attach -t $SESSION &
fi
