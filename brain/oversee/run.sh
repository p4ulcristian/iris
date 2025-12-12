#!/bin/bash
# Run a command in a project directory (non-Claude pane)
# Usage: run.sh <project> <command...>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SESSION="iris"

PROJECT="$1"
shift
CMD="$*"

if [ -z "$PROJECT" ] || [ -z "$CMD" ]; then
    echo "Usage: run.sh <project> <command...>"
    exit 1
fi

# Resolve project directory
case "$PROJECT" in
    ironrainbow|ir|"iron rainbow")
        PROJECT_DIR="/home/paul/Work/ironrainbow"
        ;;
    elevathor|el)
        PROJECT_DIR="/home/paul/Work/elevathor"
        ;;
    colormecrazy|cmc|"color me crazy")
        PROJECT_DIR="/home/paul/Work/colormecrazy"
        ;;
    iris)
        PROJECT_DIR="/home/paul/Iris"
        ;;
    *)
        # Assume it's a direct path
        if [ -d "$PROJECT" ]; then
            PROJECT_DIR="$PROJECT"
        else
            echo "Unknown project: $PROJECT"
            exit 1
        fi
        ;;
esac

# Create pane with command
PANE_ID=$("$SCRIPT_DIR/pane.sh" create "cd '$PROJECT_DIR' && $CMD")

# Simple title - just the command basename
TITLE="${CMD%% *}"
TITLE="${TITLE##*/}"
tmux select-pane -t "$PANE_ID" -T "$TITLE"

# Apply layout
"$SCRIPT_DIR/layout.sh" "$SESSION"

echo "$PANE_ID"
