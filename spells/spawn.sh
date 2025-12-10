#!/bin/bash
# Spawn a new shade with a task
# Usage: spawn.sh [--project <project>] <task>
#
# Composes: pane.sh, color.sh, title.sh
# State: tmux pane titles are source of truth, shadows/<uuid>/ stores logs

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IRIS_DIR="$HOME/Iris"
SETTINGS="$IRIS_DIR/config/settings.json"

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

# Build init message from settings.json template
# Use bash parameter expansion instead of sed - handles multiline TASK safely
SHADE_PROMPT=$(jq -r '.prompts.shade' "$SETTINGS")
INIT_MSG="${SHADE_PROMPT//\{\{COLOR_NAME\}\}/$COLOR_NAME}"
INIT_MSG="${INIT_MSG//\{\{WORKER_UUID\}\}/$WORKER_UUID}"
INIT_MSG="${INIT_MSG//\{\{TASK\}\}/$TASK}"

# Build claude command with message as argument (instant start, no paste delay)
# Escape single quotes in init message for safe embedding
# Export SHADE_UUID and SHADE_NAME so report.sh can identify the shade
ESCAPED_MSG="${INIT_MSG//\'/\'\\\'\'}"
if [ -n "$PROJECT_DIR" ]; then
    CLAUDE_CMD="cd ~/Iris && SHADE_UUID='$WORKER_UUID' SHADE_NAME='$COLOR_NAME' claude --dangerously-skip-permissions --add-dir '$PROJECT_DIR' -- '$ESCAPED_MSG'"
else
    CLAUDE_CMD="cd ~/Iris && SHADE_UUID='$WORKER_UUID' SHADE_NAME='$COLOR_NAME' claude --dangerously-skip-permissions -- '$ESCAPED_MSG'"
fi

# === COMPOSE MODULES ===

# 1. Create shadows folder for this shade
SHADOWS_DIR="$IRIS_DIR/shadows/$WORKER_UUID"
mkdir -p "$SHADOWS_DIR"
echo "$TASK" > "$SHADOWS_DIR/task.txt"
echo "$COLOR_NAME" > "$SHADOWS_DIR/name.txt"
[ -n "$PROJECT" ] && echo "$PROJECT" > "$SHADOWS_DIR/project.txt"
date -Iseconds > "$SHADOWS_DIR/spawned.txt"
echo "laboring" > "$SHADOWS_DIR/status.txt"

# 2. Create pane (Claude starts immediately with the task)
PANE_ID=$("$SCRIPT_DIR/pane.sh" create "$CLAUDE_CMD")

# 3. Set pane title with structured metadata: Name|uuid|project
# tmux pane title is now the source of truth for active shades
TITLE_META="$COLOR_NAME|$WORKER_UUID|${PROJECT:-none}"
tmux select-pane -t "$PANE_ID" -T "$TITLE_META"

# 4. Set pane appearance
tmux select-pane -t "$PANE_ID" -P "bg=$COLOR_BG"

# 5. Start pipe-pane logging to shadows folder
tmux pipe-pane -t "$PANE_ID" "cat >> '$SHADOWS_DIR/output.log'"

# 6. Ensure tmux settings
tmux set-option -t iris allow-set-title off 2>/dev/null

# 7. Apply layout
"$SCRIPT_DIR/layout.sh" iris

echo "$WORKER_UUID"
