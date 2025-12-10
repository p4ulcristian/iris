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
SPELLS_DIR="$IRIS_DIR/spells"
SESSION="iris"

# Iris theme colors
IRIS_HEADER="#c9b1d4"  # Silver-violet
IRIS_BG="#1f1a28"      # Nebula

# Terminal colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Start Iris session
cmd_start() {
    if ! tmux has-session -t $SESSION 2>/dev/null; then
        tmux new-session -d -s $SESSION

        # Style status bar
        tmux set-option -t $SESSION status on
        tmux set-option -t $SESSION status-position top
        tmux set-option -t $SESSION status-style "bg=$IRIS_HEADER,fg=#000000"
        tmux set-option -t $SESSION status-left " Iris "
        tmux set-option -t $SESSION status-left-length 50
        tmux set-option -t $SESSION status-right ""
        tmux set-option -t $SESSION window-status-format ""
        tmux set-option -t $SESSION window-status-current-format ""

        # Style pane
        tmux select-pane -t $SESSION -P "bg=$IRIS_BG"
        tmux set-option -t $SESSION allow-set-title off

        tmux send-keys -t $SESSION "cd ~/Iris && claude --dangerously-skip-permissions" Enter
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

# Spawn - delegates to spawn.sh
cmd_spawn() {
    if ! tmux has-session -t $SESSION 2>/dev/null; then
        echo -e "${RED}Iris not running. Start with: iris${NC}"
        exit 1
    fi

    UUID=$("$SPELLS_DIR/spawn.sh" "$@")
    SHADE_JSON=$("$SPELLS_DIR/registry.sh" get "$UUID")
    NAME=$(echo "$SHADE_JSON" | jq -r '.name')
    PANE_ID=$(echo "$SHADE_JSON" | jq -r '.pane_id')
    TASK=$(echo "$SHADE_JSON" | jq -r '.task')

    echo -e "${GREEN}Spawned ${BOLD}$NAME${NC}${GREEN} ($PANE_ID)${NC}"
    echo -e "  Task: $TASK"
}

# Kill - delegates to kill.sh or kills all
cmd_kill() {
    local name="$1"

    if [ -z "$name" ]; then
        echo -e "${RED}Error: No shade name provided${NC}"
        echo "Usage: iris kill <name|all>"
        "$SPELLS_DIR/list.sh"
        exit 1
    fi

    if [ "$name" = "all" ]; then
        local panes=$("$SPELLS_DIR/pane.sh" list)
        local count=0

        for pane in $panes; do
            "$SPELLS_DIR/pane.sh" kill "$pane" 2>/dev/null && ((count++)) || true
        done

        if [ $count -gt 0 ]; then
            echo -e "${GREEN}Killed $count shade(s)${NC}"
            sleep 0.2
            "$SPELLS_DIR/layout.sh" $SESSION
        else
            echo -e "${YELLOW}No shades to kill${NC}"
        fi
    else
        "$SPELLS_DIR/kill.sh" "$name"
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

    UUID=$("$SPELLS_DIR/registry.sh" lookup "$name")
    if [ -z "$UUID" ]; then
        echo -e "${RED}Shade '$name' not found${NC}"
        exit 1
    fi

    SHADE_JSON=$("$SPELLS_DIR/registry.sh" get "$UUID")
    PANE_ID=$(echo "$SHADE_JSON" | jq -r '.pane_id')

    "$SPELLS_DIR/send.sh" "$PANE_ID" "$message"
    echo -e "${GREEN}Sent to $name:${NC} $message"
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

    UUID=$("$SPELLS_DIR/registry.sh" lookup "$name")
    if [ -z "$UUID" ]; then
        echo -e "${RED}Shade '$name' not found${NC}"
        exit 1
    fi

    SHADE_JSON=$("$SPELLS_DIR/registry.sh" get "$UUID")
    PANE_ID=$(echo "$SHADE_JSON" | jq -r '.pane_id')

    echo -e "${BOLD}Output from $name ($PANE_ID):${NC}"
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
        status|list|ls)   "$SPELLS_DIR/list.sh" ;;
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
