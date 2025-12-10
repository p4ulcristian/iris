#!/bin/bash
# Spawn a new shade with a task (WezTerm native)
# Usage: spawn.sh [--project <project>] <task>
#
# Composes: color.sh, registry.sh, title.sh

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
    echo "Usage: spawn.sh [--project <project>] <task>" >&2
    exit 1
fi

# Get next available color
COLOR_JSON=$("$SCRIPT_DIR/color.sh" next)
COLOR_NAME=$(echo "$COLOR_JSON" | jq -r '.name')
WORKER_UUID="${COLOR_NAME,,}-$(date +%Y%m%d-%H%M%S)-$(openssl rand -hex 2)"

# Build init message for Claude
INIT_MSG="You are $COLOR_NAME. Your UUID is $WORKER_UUID. Never use ./say.sh directly. Update title: ./spells/title.sh $WORKER_UUID \"task\". Your task: $TASK"

# Build claude command
if [ -n "$PROJECT_DIR" ]; then
    CLAUDE_CMD="claude --dangerously-skip-permissions --add-dir $PROJECT_DIR \"$INIT_MSG\""
else
    CLAUDE_CMD="claude --dangerously-skip-permissions \"$INIT_MSG\""
fi

# Spawn new tab in WezTerm
PANE_ID=$(wezterm cli spawn --cwd "$IRIS_DIR" -- bash -c "$CLAUDE_CMD")

# Set tab title (shade name + task)
SHORT_TASK="${TASK:0:40}"
[ ${#TASK} -gt 40 ] && SHORT_TASK="${SHORT_TASK}..."
wezterm cli set-tab-title --pane-id "$PANE_ID" "$COLOR_NAME: $SHORT_TASK"

# Register shade
"$SCRIPT_DIR/registry.sh" add "$WORKER_UUID" "$PANE_ID" "$COLOR_NAME" "$TASK" "$PROJECT"

echo "$WORKER_UUID"
