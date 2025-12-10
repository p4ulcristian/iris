#!/bin/bash
# Spawn a new worker with a task in one command
# Usage: new-worker.sh [--project <project>] [--sync] <task>
#
# By default, spawns in background (non-blocking) - Iris can keep talking
# Use --sync to wait for Claude to be ready before returning
#
# Examples:
#   new-worker.sh "Tell me a joke"
#   new-worker.sh --project ironrainbow "Check git status and commit"
#   new-worker.sh --project iris "Fix the bug in server.py"
#   new-worker.sh --sync "Task that needs immediate confirmation"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGISTRY="$SCRIPT_DIR/sessions/registry.json"

# Rainbow spectrum colors for rays (12 total)
COLORS=("#2a1a1a" "#2a1f1a" "#2a2a1a" "#1a2a1a" "#1a1a2a" "#1f1a2a" "#2a1a2a" "#2a1a1f" "#1a2a2a" "#2a1a2a" "#2a2a1f" "#2a2a1a")
COLOR_NAMES=("Ruby" "Amber" "Sol" "Jade" "Azure" "Indigo" "Violet" "Coral" "Cyan" "Magenta" "Crimson" "Gold")
HEADER_COLORS=("#dc143c" "#ff8c00" "#ffd700" "#2e8b57" "#007fff" "#4b0082" "#8b00ff" "#ff7f50" "#00ced1" "#ff00ff" "#dc143c" "#ffd700")

# Parse arguments
PROJECT=""
PROJECT_DIR=""
SYNC_MODE=false

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
        --sync)
            SYNC_MODE=true
            shift
            ;;
        *)
            break
            ;;
    esac
done

TASK="$*"

if [ -z "$TASK" ]; then
    echo "Usage: new-worker.sh [--project <project>] [--sync] <task>"
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
USED_COLORS=$(tmux list-panes -t iris -F '#{pane_title}' 2>/dev/null | grep -oE '(Ruby|Amber|Sol|Jade|Azure|Indigo|Violet|Coral|Cyan|Magenta|Crimson|Gold)' || true)
AVAILABLE=()
for i in "${!COLOR_NAMES[@]}"; do
    if ! echo "$USED_COLORS" | grep -q "${COLOR_NAMES[$i]}"; then
        AVAILABLE+=("$i")
    fi
done
# If all colors used, allow any
if [ ${#AVAILABLE[@]} -eq 0 ]; then
    AVAILABLE=(0 1 2 3 4 5 6 7 8 9 10 11)
fi
# Pick random from available
COLOR_INDEX=${AVAILABLE[$(( RANDOM % ${#AVAILABLE[@]} ))]}
COLOR="${COLORS[$COLOR_INDEX]}"
COLOR_NAME="${COLOR_NAMES[$COLOR_INDEX]}"
HEADER_COLOR="${HEADER_COLORS[$COLOR_INDEX]}"

# Generate unique worker UUID: name-YYYYMMDD-HHMMSS-random4
WORKER_UUID="${COLOR_NAME,,}-$(date +%Y%m%d-%H%M%S)-$(openssl rand -hex 2)"

# Add worker to registry
if [ -f "$REGISTRY" ]; then
    jq --arg uuid "$WORKER_UUID" \
       --arg name "$COLOR_NAME" \
       --arg pane "$PANE_ID" \
       --arg task "$TASK" \
       --arg project "$PROJECT" \
       --arg project_dir "$PROJECT_DIR" \
       --arg color "$HEADER_COLOR" \
       --arg bg_color "$COLOR" \
       --arg time "$(date -Iseconds)" \
       '.active[$uuid] = {
         name: $name,
         uuid: $uuid,
         pane_id: $pane,
         task: $task,
         project: $project,
         project_dir: $project_dir,
         color: $color,
         bg_color: $bg_color,
         spawned_at: $time,
         status: "starting",
         last_update: $time
       }' "$REGISTRY" > "/tmp/registry.$$.json" && mv "/tmp/registry.$$.json" "$REGISTRY"
fi

# Ensure pane-border-status is enabled for title visibility
tmux set-option -t iris pane-border-status top 2>/dev/null
tmux set-option -t iris pane-border-format '#{pane_title}' 2>/dev/null
# Prevent Claude Code from overwriting our styled titles
tmux set-option -t iris allow-set-title off 2>/dev/null

# Set pane color and title (show "Starting..." until Claude is ready)
tmux select-pane -t "$PANE_ID" -P "bg=$COLOR"
tmux select-pane -t "$PANE_ID" -T "#[bg=$HEADER_COLOR,fg=white,bold] $COLOR_NAME - Starting... "

# Apply smart layout and refocus master
"$SCRIPT_DIR/smart-layout.sh" iris

# Build the init message (now includes UUID)
INIT_MSG="You are $COLOR_NAME ($PANE_ID). Your UUID is $WORKER_UUID. Never use ./say.sh directly. Update title: ./spells/set-worker-title.sh $WORKER_UUID \"task\". When done: ./spells/worker-done.sh $WORKER_UUID \"summary\". Your task: $TASK"

# Function to wait for Claude and send the task
wait_and_send() {
    local pane_id="$1"
    local msg="$2"
    local color_name="$3"
    local header_color="$4"
    local task="$5"

    # Wait for Claude to fully load (check for the input prompt)
    local max_wait=30
    local waited=0
    while [ $waited -lt $max_wait ]; do
        # Check if Claude is ready by looking for the prompt character
        local output
        output=$(tmux capture-pane -t "$pane_id" -p 2>/dev/null | tail -5)
        if echo "$output" | grep -qE '(^>|❯|claude)'; then
            break
        fi
        sleep 0.5
        waited=$((waited + 1))
    done

    # Update title to show actual task (truncated for display)
    local short_task="${task:0:50}"
    [ ${#task} -gt 50 ] && short_task="${short_task}..."
    tmux select-pane -t "$pane_id" -T "#[bg=$header_color,fg=white,bold] $color_name - $short_task "

    # Send the task - use send-keys -l for literal mode (faster than paste-buffer with Claude Code)
    tmux send-keys -t "$pane_id" -l "$msg"
    tmux send-keys -t "$pane_id" Enter
}

if [ "$SYNC_MODE" = true ]; then
    # Synchronous mode - wait here
    wait_and_send "$PANE_ID" "$INIT_MSG" "$COLOR_NAME" "$HEADER_COLOR" "$TASK"
else
    # Async mode - spawn background process to wait and send
    # This lets Iris continue talking while worker spins up
    wait_and_send "$PANE_ID" "$INIT_MSG" "$COLOR_NAME" "$HEADER_COLOR" "$TASK" &
    disown
fi

# Output UUID (primary identifier) and pane ID
echo "$WORKER_UUID"
