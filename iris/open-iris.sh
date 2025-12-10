#!/bin/bash
#
# Iris CLI - Worker management for Iris orchestration
#
# Usage: iris-cli [command] [options]
#
# Commands:
#   (no command)                       Start Iris (or focus if already running)
#   spawn [--project <name>] <task>    Spawn a new worker with a task
#   status                             List all active workers
#   kill <name|all>                    Kill a worker by name (or all workers)
#   send <name> <message>              Send a message to a worker
#   peek <name> [lines]                View recent output from a worker
#   notes [project]                    List session notes (optionally filter by project)
#   stop                               Kill all workers and the iris tmux session
#   help                               Show this help message
#

set -e

THINK_DIR="$HOME/Think"
IRIS_DIR="$THINK_DIR/iris"
SESSION="iris"

# Iris theme colors
IRIS_HEADER="#c9b1d4"  # Silver-violet
IRIS_BG="#1f1a28"      # Nebula

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Worker colors and names
COLORS=("#2a1a1a" "#1a2a2a" "#2a2a1a" "#1a2a22" "#2a1a2a" "#1a222a")
COLOR_NAMES=("Fred" "Neil" "Mellow" "Clint" "Chum" "Kai")
HEADER_COLORS=("#8b3a3a" "#2a6a6a" "#8a8a2a" "#2a6a4a" "#6a2a5a" "#2a4a6a")

# Project directory mapping
get_project_dir() {
    local project="$1"
    case "$project" in
        ironrainbow|"iron rainbow")
            echo "/home/paul/Work/ironrainbow"
            ;;
        elevathor)
            echo "/home/paul/Work/elevathor"
            ;;
        colormecrazy|"color me crazy")
            echo "/home/paul/Work/colormecrazy"
            ;;
        iris)
            echo "/home/paul/Work/iris"
            ;;
        *)
            echo ""
            ;;
    esac
}

# Find available worker color
get_available_color() {
    local used_colors=$(tmux list-panes -t $SESSION -F '#{pane_title}' 2>/dev/null | grep -oE '(Fred|Neil|Mellow|Clint|Chum|Kai)' || true)
    local available=()

    for i in "${!COLOR_NAMES[@]}"; do
        if ! echo "$used_colors" | grep -q "${COLOR_NAMES[$i]}"; then
            available+=("$i")
        fi
    done

    # If all colors used, allow any
    if [ ${#available[@]} -eq 0 ]; then
        available=(0 1 2 3 4 5)
    fi

    # Return random from available
    echo "${available[$(( RANDOM % ${#available[@]} ))]}"
}

# Get pane ID by worker name
get_pane_by_name() {
    local name="$1"
    tmux list-panes -t $SESSION -F '#{pane_id} #{pane_title}' 2>/dev/null | grep -i "$name" | head -1 | awk '{print $1}'
}

# List all workers
list_workers() {
    local panes=$(tmux list-panes -t $SESSION -F '#{pane_id}|#{pane_title}' 2>/dev/null | grep -v '^%0|')

    if [ -z "$panes" ]; then
        echo -e "${YELLOW}No active workers${NC}"
        return
    fi

    echo -e "${BOLD}Active Workers:${NC}"
    echo ""

    while IFS='|' read -r pane_id title; do
        local name=""
        local task=""

        if echo "$title" | grep -q "bold\]"; then
            local content=$(echo "$title" | sed 's/.*bold\] //' | sed 's/ $//')
            name=$(echo "$content" | grep -oE '^(Fred|Neil|Mellow|Clint|Chum|Kai)' | head -1)
            if echo "$content" | grep -q " - "; then
                task=$(echo "$content" | sed 's/^[^ ]* - //')
            elif echo "$content" | grep -q "✓"; then
                task=$(echo "$content" | sed 's/^[^ ]* //')
            else
                task="$content"
            fi
        else
            name="$title"
            task="(no task set)"
        fi

        [ -z "$name" ] && name="Unknown"

        local output=$(tmux capture-pane -t "$pane_id" -p 2>/dev/null | tail -10)
        local status="idle"
        if echo "$output" | grep -q "esc to interrupt"; then
            status="working"
        fi

        local status_color="${GREEN}"
        if [ "$status" = "working" ]; then
            status_color="${CYAN}"
        fi

        echo -e "  ${BOLD}$name${NC} ($pane_id)"
        echo -e "    Task: $task"
        echo -e "    Status: ${status_color}$status${NC}"
        echo ""
    done <<< "$panes"
}

# Start Iris session
cmd_start() {
    # Check if session exists
    if ! tmux has-session -t $SESSION 2>/dev/null; then
        # Create new session
        tmux new-session -d -s $SESSION

        # Set up status bar as header
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

        # Set pane background
        tmux select-pane -t $SESSION -P "bg=$IRIS_BG"

        # Prevent Claude Code from overwriting titles
        tmux set-option -t $SESSION allow-set-title off

        tmux send-keys -t $SESSION "cd ~/Think && claude --dangerously-skip-permissions" Enter
        echo -e "${GREEN}Iris session started${NC}"
        sleep 1
    fi

    # Check if Ghostty with Iris is already open
    if pgrep -f "ghostty.*tmux attach.*$SESSION" > /dev/null 2>&1; then
        # Focus existing window using hyprctl
        hyprctl dispatch focuswindow "class:com.mitchellh.ghostty" 2>/dev/null || true
    else
        # Open new Ghostty attached to session
        ghostty -e tmux attach -t $SESSION &
    fi
}

# Spawn a new worker
cmd_spawn() {
    # Ensure session exists
    if ! tmux has-session -t $SESSION 2>/dev/null; then
        echo -e "${RED}Iris not running. Start with: iris-cli${NC}"
        exit 1
    fi

    local project=""
    local project_dir=""

    # Parse --project flag
    if [ "$1" = "--project" ] || [ "$1" = "-p" ]; then
        project="$2"
        project_dir=$(get_project_dir "$project")
        shift 2
    fi

    local task="$*"

    if [ -z "$task" ]; then
        echo -e "${RED}Error: No task provided${NC}"
        echo "Usage: iris-cli spawn [--project <name>] <task>"
        exit 1
    fi

    # Build claude command
    local claude_cmd="cd ~/Think && claude --dangerously-skip-permissions"
    if [ -n "$project_dir" ]; then
        claude_cmd="$claude_cmd --add-dir $project_dir"
    fi

    # Create pane and get ID
    local pane_id=$(tmux split-window -t $SESSION -h -d -P -F '#{pane_id}' "$claude_cmd")

    # Get available color
    local color_index=$(get_available_color)
    local color="${COLORS[$color_index]}"
    local name="${COLOR_NAMES[$color_index]}"
    local header_color="${HEADER_COLORS[$color_index]}"

    # Configure pane titles
    tmux set-option -t $SESSION pane-border-status top 2>/dev/null
    tmux set-option -t $SESSION pane-border-format '#{pane_title}' 2>/dev/null
    tmux set-option -t $SESSION allow-set-title off 2>/dev/null

    # Set pane color and title
    tmux select-pane -t "$pane_id" -P "bg=$color"
    tmux select-pane -t "$pane_id" -T "#[bg=$header_color,fg=white,bold] $name - $task "

    # Apply smart layout
    "$IRIS_DIR/smart-layout.sh" $SESSION

    # Wait for Claude to load
    local max_wait=30
    local waited=0
    while [ $waited -lt $max_wait ]; do
        local output=$(tmux capture-pane -t "$pane_id" -p 2>/dev/null | tail -5)
        if echo "$output" | grep -qE '(^>|❯|claude)'; then
            break
        fi
        sleep 1
        waited=$((waited + 1))
    done

    # Send init and task
    tmux send-keys -t "$pane_id" "You are $name ($pane_id). Never use ./say.sh directly. Update title: ./iris/set-worker-title.sh $pane_id $name \"$header_color\" \"task\". When done: ./iris/worker-done.sh $pane_id $name \"$header_color\" \"summary\". Your task: $task"
    tmux send-keys -t "$pane_id" Enter

    echo -e "${GREEN}Spawned worker ${BOLD}$name${NC}${GREEN} ($pane_id)${NC}"
    if [ -n "$project" ]; then
        echo -e "  Project: $project"
    fi
    echo -e "  Task: $task"
}

# Kill a worker
cmd_kill() {
    local name="$1"

    if [ -z "$name" ]; then
        echo -e "${RED}Error: No worker name provided${NC}"
        echo "Usage: iris-cli kill <name|all>"
        echo ""
        list_workers
        exit 1
    fi

    # Kill all workers
    if [ "$name" = "all" ]; then
        local panes=$(tmux list-panes -t $SESSION -F '#{pane_id}' 2>/dev/null | grep -v '^%0$')
        local count=0

        for pane in $panes; do
            tmux kill-pane -t "$pane" 2>/dev/null && ((count++))
        done

        if [ $count -gt 0 ]; then
            echo -e "${GREEN}Killed $count worker(s)${NC}"
            sleep 0.2
            "$IRIS_DIR/smart-layout.sh" $SESSION
        else
            echo -e "${YELLOW}No workers to kill${NC}"
        fi
        return
    fi

    # Find and kill specific worker
    local pane_id=$(get_pane_by_name "$name")

    if [ -z "$pane_id" ]; then
        echo -e "${RED}Worker '$name' not found${NC}"
        list_workers
        exit 1
    fi

    if [ "$pane_id" = "%0" ]; then
        echo -e "${RED}Can't kill master pane!${NC}"
        exit 1
    fi

    tmux kill-pane -t "$pane_id"
    echo -e "${GREEN}Killed worker $name ($pane_id)${NC}"

    sleep 0.2
    "$IRIS_DIR/smart-layout.sh" $SESSION
}

# Send message to worker
cmd_send() {
    local name="$1"
    shift
    local message="$*"

    if [ -z "$name" ] || [ -z "$message" ]; then
        echo -e "${RED}Error: Need worker name and message${NC}"
        echo "Usage: iris-cli send <name> <message>"
        exit 1
    fi

    local pane_id=$(get_pane_by_name "$name")

    if [ -z "$pane_id" ]; then
        echo -e "${RED}Worker '$name' not found${NC}"
        list_workers
        exit 1
    fi

    tmux send-keys -t "$pane_id" "$message"
    tmux send-keys -t "$pane_id" Enter

    echo -e "${GREEN}Sent to $name:${NC} $message"
}

# Peek at worker output
cmd_peek() {
    local name="$1"
    local lines="${2:-30}"

    if [ -z "$name" ]; then
        echo -e "${RED}Error: No worker name provided${NC}"
        echo "Usage: iris-cli peek <name> [lines]"
        exit 1
    fi

    local pane_id=$(get_pane_by_name "$name")

    if [ -z "$pane_id" ]; then
        echo -e "${RED}Worker '$name' not found${NC}"
        list_workers
        exit 1
    fi

    echo -e "${BOLD}Output from $name ($pane_id):${NC}"
    echo "─────────────────────────────────────────"
    tmux capture-pane -t "$pane_id" -p | tail -"$lines"
    echo "─────────────────────────────────────────"
}

# List session notes
cmd_notes() {
    local project="$1"
    local notes_dir="$IRIS_DIR/sessions/notes"

    if [ ! -d "$notes_dir" ]; then
        echo -e "${YELLOW}No session notes found${NC}"
        return
    fi

    if [ -n "$project" ]; then
        echo -e "${BOLD}Session notes for $project:${NC}"
        ls -1 "$notes_dir" 2>/dev/null | grep -i "$project" || echo -e "${YELLOW}No notes found for '$project'${NC}"
    else
        echo -e "${BOLD}All session notes:${NC}"
        ls -1 "$notes_dir" 2>/dev/null || echo -e "${YELLOW}No notes found${NC}"
    fi
}

# Stop Iris - kill all workers and the session
cmd_stop() {
    if ! tmux has-session -t $SESSION 2>/dev/null; then
        echo -e "${YELLOW}Iris is not running${NC}"
        exit 0
    fi

    echo -e "${YELLOW}Stopping Iris...${NC}"

    # Kill all worker panes first
    local panes=$(tmux list-panes -t $SESSION -F '#{pane_id}' 2>/dev/null | grep -v '^%0$')
    local count=0

    for pane in $panes; do
        tmux kill-pane -t "$pane" 2>/dev/null && ((count++))
    done

    if [ $count -gt 0 ]; then
        echo -e "  Killed $count worker(s)"
    fi

    # Kill the session
    tmux kill-session -t $SESSION 2>/dev/null && echo -e "${GREEN}Iris stopped${NC}"
}

# Show help
cmd_help() {
    echo -e "${BOLD}Iris CLI${NC} - Worker management for Iris orchestration"
    echo ""
    echo -e "${BOLD}Usage:${NC} iris-cli [command] [options]"
    echo ""
    echo -e "${BOLD}Commands:${NC}"
    echo -e "  ${CYAN}(no command)${NC}"
    echo "        Start Iris (or focus if already running)"
    echo ""
    echo -e "  ${CYAN}spawn${NC} [--project <name>] <task>"
    echo "        Spawn a new worker with a task"
    echo "        Projects: ironrainbow, elevathor, colormecrazy, iris"
    echo ""
    echo -e "  ${CYAN}status${NC}"
    echo "        List all active workers and their status"
    echo ""
    echo -e "  ${CYAN}kill${NC} <name|all>"
    echo "        Kill a worker by name, or 'all' to kill all workers"
    echo ""
    echo -e "  ${CYAN}send${NC} <name> <message>"
    echo "        Send a message/task to a worker"
    echo ""
    echo -e "  ${CYAN}peek${NC} <name> [lines]"
    echo "        View recent output from a worker (default: 30 lines)"
    echo ""
    echo -e "  ${CYAN}notes${NC} [project]"
    echo "        List session notes (optionally filter by project)"
    echo ""
    echo -e "  ${CYAN}stop${NC}"
    echo "        Stop Iris and kill all workers"
    echo ""
    echo -e "  ${CYAN}help${NC}"
    echo "        Show this help message"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  iris-cli                                    # Start Iris"
    echo "  iris-cli stop                               # Stop Iris"
    echo "  iris-cli spawn \"Tell me a joke\""
    echo "  iris-cli spawn --project ironrainbow \"Fix the shader bug\""
    echo "  iris-cli status"
    echo "  iris-cli send Fred \"Add unit tests\""
    echo "  iris-cli peek Neil 50"
    echo "  iris-cli kill Mellow"
}

# Main command dispatch
main() {
    local cmd="${1:-}"

    # No command = start
    if [ -z "$cmd" ]; then
        cmd_start
        exit 0
    fi

    shift

    case "$cmd" in
        start|open)
            cmd_start
            ;;
        spawn|new|create)
            cmd_spawn "$@"
            ;;
        status|list|ls)
            list_workers
            ;;
        kill|rm|remove)
            cmd_kill "$@"
            ;;
        send|msg|message)
            cmd_send "$@"
            ;;
        peek|view|output|log)
            cmd_peek "$@"
            ;;
        notes)
            cmd_notes "$@"
            ;;
        stop|quit|exit)
            cmd_stop
            ;;
        help|--help|-h)
            cmd_help
            ;;
        *)
            echo -e "${RED}Unknown command: $cmd${NC}"
            echo ""
            cmd_help
            exit 1
            ;;
    esac
}

main "$@"
