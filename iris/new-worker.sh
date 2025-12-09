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
HEADER_COLORS=("#8b3a3a" "#2a6a6a" "#8a8a2a" "#2a6a4a" "#6a2a5a" "#2a4a6a")

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

# Random color from unused ones
USED_COLORS=$(tmux list-panes -t iris -F '#{pane_title}' 2>/dev/null | grep -oE '(Fred|Neil|Mellow|Clint|Chum|Kai)' || true)
AVAILABLE=()
for i in "${!COLOR_NAMES[@]}"; do
    if ! echo "$USED_COLORS" | grep -q "${COLOR_NAMES[$i]}"; then
        AVAILABLE+=("$i")
    fi
done
# If all colors used, allow any
if [ ${#AVAILABLE[@]} -eq 0 ]; then
    AVAILABLE=(0 1 2 3 4 5)
fi
# Pick random from available
COLOR_INDEX=${AVAILABLE[$(( RANDOM % ${#AVAILABLE[@]} ))]}
COLOR="${COLORS[$COLOR_INDEX]}"
COLOR_NAME="${COLOR_NAMES[$COLOR_INDEX]}"
HEADER_COLOR="${HEADER_COLORS[$COLOR_INDEX]}"

# Ensure pane-border-status is enabled for title visibility
tmux set-option -t iris pane-border-status top 2>/dev/null
tmux set-option -t iris pane-border-format '#{pane_title}' 2>/dev/null

# Set pane color and title
tmux select-pane -t "$PANE_ID" -P "bg=$COLOR"
tmux select-pane -t "$PANE_ID" -T "#[bg=$HEADER_COLOR,fg=white,bold] $COLOR_NAME - $TASK "

# Apply smart layout and refocus master
./iris/smart-layout.sh iris

# Wait for Claude to fully load (check for the input prompt)
MAX_WAIT=30
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    # Check if Claude is ready by looking for the prompt character
    OUTPUT=$(tmux capture-pane -t "$PANE_ID" -p 2>/dev/null | tail -5)
    if echo "$OUTPUT" | grep -qE '(^>|❯|claude)'; then
        break
    fi
    sleep 1
    WAITED=$((WAITED + 1))
done

# Send init and task
tmux send-keys -t "$PANE_ID" "You are $COLOR_NAME ($PANE_ID). Never use ./say.sh directly. Update title: ./iris/set-worker-title.sh $PANE_ID $COLOR_NAME \"$HEADER_COLOR\" \"task\". When done: ./iris/worker-done.sh $PANE_ID $COLOR_NAME \"$HEADER_COLOR\" \"summary\". Your task: $TASK"
tmux send-keys -t "$PANE_ID" Enter

echo "$PANE_ID"
