#!/bin/bash
#
# Iris CLI - Shade management for Iris orchestration
#
# Usage: iris [command] [options]
#
# Commands:
#   (no command)                       Start Iris (or focus if already running)
#   spawn [--project <name>] <task>    Spawn a new shade with a task
#   status                             List all active shades
#   kill <name|all>                    Kill a shade by name (or all)
#   send <name> <message>              Send a message to a shade
#   peek <name> [lines]                View recent output from a shade
#   stop                               Kill all shades and the iris session
#   help                               Show this help message

set -e

IRIS_DIR="$HOME/Iris"
OVERSEE_DIR="$IRIS_DIR/brain/oversee"
DO_DIR="$IRIS_DIR/brain/do"
SETTINGS="$IRIS_DIR/config/settings.json"
SESSION="iris"

# Terminal colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Start messenger
start_messenger() {
    # Messenger removed in refactor - will be replaced with HTTP-based communication
    :
}

# Stop messenger
stop_messenger() {
    if [ -f /tmp/iris/messenger.pid ]; then
        kill "$(cat /tmp/iris/messenger.pid)" 2>/dev/null || true
        rm -f /tmp/iris/messenger.pid
    fi
}

# Start Iris session
cmd_start() {
    if ! tmux has-session -t $SESSION 2>/dev/null; then
        tmux new-session -d -s $SESSION

        # Load colors from config
        IRIS_JSON=$("$DO_DIR/color.sh" iris)
        IRIS_BG=$(echo "$IRIS_JSON" | jq -r '.bg')

        BORDER_JSON=$("$DO_DIR/color.sh" border)
        BORDER_BG=$(echo "$BORDER_JSON" | jq -r '.bg')
        BORDER_FG=$(echo "$BORDER_JSON" | jq -r '.fg')

        # Status bar off - using pane title bars instead
        tmux set-option -t $SESSION status off

        # Style borders
        tmux set-option -t $SESSION pane-border-status top
        tmux set-option -t $SESSION pane-border-lines heavy
        tmux set-option -t $SESSION pane-border-style "fg=$BORDER_BG,bg=$BORDER_BG"
        tmux set-option -t $SESSION pane-active-border-style "fg=$BORDER_BG,bg=$BORDER_BG"
        tmux set-option -t $SESSION pane-border-format "#[bg=$BORDER_BG,fg=$BORDER_FG,bold] #{pane_title} "

        # Style pane
        tmux select-pane -t $SESSION -P "bg=$IRIS_BG"
        tmux select-pane -t $SESSION -T "𓂀 Iris"
        tmux set-option -t $SESSION allow-set-title off

        # Start messenger for shade notifications
        start_messenger

        # Load Iris prompt from settings
        IRIS_PROMPT=$(jq -r '.prompts.iris' "$SETTINGS")
        ESCAPED_PROMPT="${IRIS_PROMPT//\'/\'\\\'\'}"
        tmux send-keys -t $SESSION "cd ~/Iris && claude --dangerously-skip-permissions -- '$ESCAPED_PROMPT'" Enter
        echo -e "${GREEN}Iris session started${NC}"
        sleep 1
    fi

    # Focus or open Ghostty
    if pgrep -f "ghostty.*tmux attach.*$SESSION" > /dev/null 2>&1; then
        hyprctl dispatch focuswindow "class:com.mitchellh.ghostty" 2>/dev/null || true
    else
        ghostty -e tmux attach -t $SESSION &
    fi
}

# Find shade by name from tmux pane titles (Name|uuid|project)
find_shade() {
    local search="${1,,}"  # lowercase
    while IFS=: read -r pane_id title; do
        [[ "$title" != *"|"* ]] && continue
        IFS='|' read -r name uuid project <<< "$title"
        [[ -z "$uuid" ]] && continue
        if [[ "${name,,}" == "$search" ]]; then
            echo "$pane_id:$name:$uuid"
            return 0
        fi
    done < <(tmux list-panes -t $SESSION -F '#{pane_id}:#{pane_title}' 2>/dev/null)
    return 1
}

# Spawn - delegates to spawn.sh
cmd_spawn() {
    if ! tmux has-session -t $SESSION 2>/dev/null; then
        echo -e "${RED}Iris not running. Start with: iris${NC}"
        exit 1
    fi

    UUID=$("$OVERSEE_DIR/spawn.sh" "$@")

    # Read info from shadows folder
    SHADOWS_DIR="$IRIS_DIR/shadows/$UUID"
    NAME=$(cat "$SHADOWS_DIR/name.txt" 2>/dev/null || echo "Unknown")
    TASK=$(cat "$SHADOWS_DIR/task.txt" 2>/dev/null || echo "")

    # Find pane ID from tmux
    PANE_ID=""
    while IFS=: read -r pid title; do
        [[ "$title" == *"$UUID"* ]] && { PANE_ID="$pid"; break; }
    done < <(tmux list-panes -t $SESSION -F '#{pane_id}:#{pane_title}' 2>/dev/null)

    echo -e "${GREEN}Spawned ${BOLD}$NAME${NC}${GREEN} ($PANE_ID)${NC}"
    echo -e "  Task: $TASK"
}

# Kill - delegates to kill.sh or kills all
cmd_kill() {
    local name="$1"

    if [ -z "$name" ]; then
        echo -e "${RED}Error: No shade name provided${NC}"
        echo "Usage: iris kill <name|all>"
        "$OVERSEE_DIR/list.sh"
        exit 1
    fi

    if [ "$name" = "all" ]; then
        # Get shade info before killing
        local count=0
        while IFS=: read -r pane_id title; do
            [[ "$pane_id" == "%0" ]] && continue
            [[ "$title" != *"|"* ]] && continue

            IFS='|' read -r shade_name uuid project <<< "$title"
            [[ -z "$uuid" ]] && continue

            # Record outcome
            local shadow_dir="$IRIS_DIR/shadows/$uuid"
            if [ -d "$shadow_dir" ]; then
                echo "killed" > "$shadow_dir/outcome.txt"
                date -Iseconds > "$shadow_dir/died.txt"
            fi

            # Stop pipe-pane and kill
            tmux pipe-pane -t "$pane_id"
            "$OVERSEE_DIR/pane.sh" kill "$pane_id" 2>/dev/null && ((count++)) || true
        done < <(tmux list-panes -t $SESSION -F '#{pane_id}:#{pane_title}' 2>/dev/null)

        if [ $count -gt 0 ]; then
            echo -e "${GREEN}Killed $count shade(s)${NC}"
        else
            echo -e "${YELLOW}No shades to kill${NC}"
        fi
    else
        "$OVERSEE_DIR/kill.sh" "$name"
        "$OVERSEE_DIR/layout.sh" $SESSION
    fi
}

# Send message to shade
cmd_send() {
    local name="$1"
    shift
    local message="$*"

    if [ -z "$name" ] || [ -z "$message" ]; then
        echo -e "${RED}Error: Need shade name and message${NC}"
        echo "Usage: iris send <name> <message>"
        exit 1
    fi

    SHADE_INFO=$(find_shade "$name")
    if [ -z "$SHADE_INFO" ]; then
        echo -e "${RED}Shade '$name' not found${NC}"
        exit 1
    fi

    IFS=: read -r PANE_ID SHADE_NAME UUID <<< "$SHADE_INFO"

    "$OVERSEE_DIR/send.sh" "$PANE_ID" "$message"
    echo -e "${GREEN}Sent to $SHADE_NAME:${NC} $message"
}

# Peek at shade output
cmd_peek() {
    local name="$1"
    local lines="${2:-30}"

    if [ -z "$name" ]; then
        echo -e "${RED}Error: No shade name provided${NC}"
        echo "Usage: iris peek <name> [lines]"
        exit 1
    fi

    SHADE_INFO=$(find_shade "$name")
    if [ -z "$SHADE_INFO" ]; then
        echo -e "${RED}Shade '$name' not found${NC}"
        exit 1
    fi

    IFS=: read -r PANE_ID SHADE_NAME UUID <<< "$SHADE_INFO"

    echo -e "${BOLD}Output from $SHADE_NAME ($PANE_ID):${NC}"
    echo "─────────────────────────────────────────"
    tmux capture-pane -t "$PANE_ID" -p | tail -"$lines"
    echo "─────────────────────────────────────────"
}

# Stop Iris
cmd_stop() {
    if ! tmux has-session -t $SESSION 2>/dev/null; then
        echo -e "${YELLOW}Iris is not running${NC}"
        exit 0
    fi

    echo -e "${YELLOW}Stopping Iris...${NC}"
    cmd_kill "all"
    stop_messenger
    tmux kill-session -t $SESSION 2>/dev/null && echo -e "${GREEN}Iris stopped${NC}"
}

# Help
cmd_help() {
    echo -e "${BOLD}Iris CLI${NC} - Shade management"
    echo ""
    echo -e "${BOLD}Usage:${NC} iris [command] [options]"
    echo ""
    echo -e "${BOLD}Commands:${NC}"
    echo -e "  ${CYAN}(no command)${NC}     Start Iris"
    echo -e "  ${CYAN}spawn${NC} <task>     Spawn a new shade"
    echo -e "  ${CYAN}status${NC}           List active shades"
    echo -e "  ${CYAN}kill${NC} <name>      Kill a shade (or 'all')"
    echo -e "  ${CYAN}send${NC} <n> <msg>   Send message to shade"
    echo -e "  ${CYAN}peek${NC} <name>      View shade output"
    echo -e "  ${CYAN}stop${NC}             Stop Iris"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  iris spawn \"Tell me a joke\""
    echo "  iris spawn --project ironrainbow \"Fix bug\""
    echo "  iris send Ruby \"Add tests\""
    echo "  iris kill Jade"
}

# Main
main() {
    local cmd="${1:-}"

    if [ -z "$cmd" ]; then
        cmd_start
        exit 0
    fi

    shift

    case "$cmd" in
        start|open)       cmd_start ;;
        spawn|new)        cmd_spawn "$@" ;;
        run)              "$OVERSEE_DIR/run.sh" "$@" ;;
        status|list|ls)   "$OVERSEE_DIR/list.sh" ;;
        kill|rm)          cmd_kill "$@" ;;
        send|msg)         cmd_send "$@" ;;
        peek|view|log)    cmd_peek "$@" ;;
        stop|quit)        cmd_stop ;;
        help|--help|-h)   cmd_help ;;
        *)
            echo -e "${RED}Unknown command: $cmd${NC}"
            cmd_help
            exit 1
            ;;
    esac
}

main "$@"
