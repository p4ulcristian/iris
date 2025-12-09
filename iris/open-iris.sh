#!/bin/bash
# Open or focus Iris tmux session

SESSION="iris"
WINDOW="master"

# Check if session exists
if ! tmux has-session -t $SESSION 2>/dev/null; then
    # Create new session with master window
    tmux new-session -d -s $SESSION -n $WINDOW
    tmux send-keys -t $SESSION:$WINDOW "cd ~/Think && claude --dangerously-skip-permissions" Enter
    sleep 1
fi

# Check if Ghostty with iris is already open
if pgrep -f "ghostty.*tmux attach.*iris" > /dev/null; then
    # Focus existing window using hyprctl
    hyprctl dispatch focuswindow "class:com.mitchellh.ghostty"
else
    # Open new Ghostty attached to session
    ghostty -e tmux attach -t $SESSION &
fi
