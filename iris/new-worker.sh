#!/bin/bash
# Spawn a new worker with a task in one command
# Usage: new-worker.sh [--project <project>] <task>
#
# Examples:
#   new-worker.sh "Tell me a joke"
#   new-worker.sh --project ironrainbow "Check git status and commit"
#   new-worker.sh --project iris "Fix the bug in server.py"

# Colors for workers (rotate through these)
COLORS=("#2a1a1a" "#1a2a2a" "#2a2a1a" "#1a2a22" "#2a1a2a" "#1a222a")
COLOR_NAMES=("Fred" "Neil" "Mellow" "Clint" "Chum" "Kai")

# Parse arguments
PROJECT=""
PROJECT_DIR=""

if [ "$1" = "--project" ]; then
    PROJECT="$2"
    shift 2

    case "$PROJECT" in
        ironrainbow|"iron rainbow")
            PROJECT_DIR="/home/paul/Work/ironrainbow"
            ;;
        elevathor)
            PROJECT_DIR="/home/paul/Work/elevathor"
            ;;
        colormecrazy|"color me crazy")
            PROJECT_DIR="/home/paul/Work/colormecrazy"
            ;;
        iris)
            PROJECT_DIR="/home/paul/Work/iris"
            ;;
    esac
fi

TASK="$*"

if [ -z "$TASK" ]; then
    echo "Usage: new-worker.sh [--project <project>] <task>"
    exit 1
fi

# Build claude command
if [ -n "$PROJECT_DIR" ]; then
    CLAUDE_CMD="cd ~/Think && claude --dangerously-skip-permissions --add-dir $PROJECT_DIR"
else
    CLAUDE_CMD="cd ~/Think && claude --dangerously-skip-permissions"
fi

# Create pane and get ID
PANE_ID=$(tmux split-window -t iris -h -d -P -F '#{pane_id}' "$CLAUDE_CMD")

# Count existing panes to pick color
PANE_COUNT=$(tmux list-panes -t iris | wc -l)
COLOR_INDEX=$(( (PANE_COUNT - 1) % ${#COLORS[@]} ))
COLOR="${COLORS[$COLOR_INDEX]}"
COLOR_NAME="${COLOR_NAMES[$COLOR_INDEX]}"

# Set pane color
tmux select-pane -t "$PANE_ID" -P "bg=$COLOR"

# Refocus master
tmux select-pane -t %0

# Fix layout
tmux select-layout -t iris main-vertical
tmux resize-pane -t iris:0.0 -x 60%

# Wait for Claude to start
sleep 3

# Send init and task
tmux send-keys -t "$PANE_ID" "You are worker $PANE_ID ($COLOR_NAME). Never use ./say.sh - only master speaks. Your task: $TASK"
tmux send-keys -t "$PANE_ID" Enter

echo "$PANE_ID"
