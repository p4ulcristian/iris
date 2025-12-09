#!/bin/bash
# Open or focus Iris tmux session

SESSION="iris"
WINDOW="master"

# Check if session exists
if ! tmux has-session -t $SESSION 2>/dev/null; then
    # Create new session with master window
    tmux new-session -d -s $SESSION -n $WINDOW

    # Enable pane border titles with colored backgrounds
    tmux set-option -t $SESSION pane-border-status top
    tmux set-option -t $SESSION pane-border-format '#{pane_title}'

    # Set master pane title and background color
    tmux select-pane -t $SESSION:$WINDOW -T "#[bg=#1a4a1a,fg=white,bold] ✳ Iris Master "
    tmux select-pane -t $SESSION:$WINDOW -P "bg=#1a2a1a"

    tmux send-keys -t $SESSION:$WINDOW "cd ~/Think && claude --dangerously-skip-permissions" Enter
    sleep 1
fi

# Ensure pane-border-status is enabled (in case session existed without it)
tmux set-option -t $SESSION pane-border-status top 2>/dev/null
tmux set-option -t $SESSION pane-border-format '#{pane_title}' 2>/dev/null

# Check if Ghostty with iris is already open
if pgrep -f "ghostty.*tmux attach.*iris" > /dev/null; then
    # Focus existing window using hyprctl
    hyprctl dispatch focuswindow "class:com.mitchellh.ghostty"
else
    # Open new Ghostty attached to session
    ghostty -e tmux attach -t $SESSION &
fi
