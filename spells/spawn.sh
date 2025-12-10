#!/bin/bash
# Spawn a new shade with a task
# Usage: spawn.sh [--project <project>] <task>
#
# Composes: pane.sh, color.sh, registry.sh, title.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IRIS_DIR="$HOME/Iris"

# Parse arguments
PROJECT=""
PROJECT_DIR=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --project)
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
            ;;
        *)
            break
            ;;
    esac
done

TASK="$*"

if [ -z "$TASK" ]; then
    echo "Usage: spawn.sh [--project <project>] [--sync] <task>"
    exit 1
fi

# Pre-generate color and UUID (needed for init message)
COLOR_JSON=$("$SCRIPT_DIR/color.sh" next)
COLOR_NAME=$(echo "$COLOR_JSON" | jq -r '.name')
COLOR_BG=$(echo "$COLOR_JSON" | jq -r '.bg')
COLOR_HEADER=$(echo "$COLOR_JSON" | jq -r '.header')
WORKER_UUID="${COLOR_NAME,,}-$(date +%Y%m%d-%H%M%S)-$(openssl rand -hex 2)"

# Build init message
INIT_MSG="You are $COLOR_NAME. Your UUID is $WORKER_UUID. Never use ./say.sh directly. Update title: ./spells/title.sh $WORKER_UUID \"task\". Your task: $TASK"

# Build claude command with message as argument (instant start, no paste delay)
# Escape single quotes in init message for safe embedding
ESCAPED_MSG="${INIT_MSG//\'/\'\\\'\'}"
if [ -n "$PROJECT_DIR" ]; then
    CLAUDE_CMD="cd ~/Iris && claude --dangerously-skip-permissions --add-dir '$PROJECT_DIR' -- '$ESCAPED_MSG'"
else
    CLAUDE_CMD="cd ~/Iris && claude --dangerously-skip-permissions -- '$ESCAPED_MSG'"
fi

# === COMPOSE MODULES ===

# 1. Create pane (Claude starts immediately with the task)
PANE_ID=$("$SCRIPT_DIR/pane.sh" create "$CLAUDE_CMD")

# 2. Register shade
"$SCRIPT_DIR/registry.sh" add "$WORKER_UUID" "$PANE_ID" "$COLOR_NAME" "$TASK" "$PROJECT"

# 3. Set pane appearance
tmux select-pane -t "$PANE_ID" -P "bg=$COLOR_BG"
SHORT_TASK="${TASK:0:50}"
[ ${#TASK} -gt 50 ] && SHORT_TASK="${SHORT_TASK}..."
"$SCRIPT_DIR/title.sh" "$PANE_ID" "$COLOR_NAME" "$COLOR_HEADER" "$SHORT_TASK"

# 4. Ensure tmux settings
tmux set-option -t iris pane-border-status top 2>/dev/null
tmux set-option -t iris pane-border-format '#{pane_title}' 2>/dev/null
tmux set-option -t iris allow-set-title off 2>/dev/null

# 5. Apply layout
"$SCRIPT_DIR/layout.sh" iris

echo "$WORKER_UUID"
