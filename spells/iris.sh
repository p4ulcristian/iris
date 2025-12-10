#!/bin/bash
#
# Iris CLI - Shade management for Iris orchestration (WezTerm native)
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
#   stop                               Kill all shades and close Iris
#   help                               Show this help message

set -e

IRIS_DIR="$HOME/Iris"
SPELLS_DIR="$IRIS_DIR/spells"

# Terminal colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Check if WezTerm CLI is available
wez_cli() {
    wezterm cli "$@" 2>/dev/null
}

# Get Iris tab pane ID (first tab is always Iris)
get_iris_pane() {
    wez_cli list --format json | jq -r '.[0].pane_id // empty'
}

# Check if WezTerm is running with Iris
iris_running() {
    local panes=$(wez_cli list --format json 2>/dev/null)
    [ -n "$panes" ] && [ "$panes" != "[]" ]
}

# Start Iris session
cmd_start() {
    if iris_running; then
        # Focus existing WezTerm window
        echo -e "${GREEN}Iris already running, focusing...${NC}"
        # Try to focus via window manager (Hyprland)
        hyprctl dispatch focuswindow "class:org.wezfurlong.wezterm" 2>/dev/null || true
    else
        # Start new WezTerm with Iris
        echo -e "${GREEN}Starting Iris...${NC}"
        wezterm start --cwd "$IRIS_DIR" -- bash -c "wezterm cli set-tab-title 'Iris' && claude --dangerously-skip-permissions" &
        disown
    fi
}

# Spawn - delegates to spawn.sh
cmd_spawn() {
    if ! iris_running; then
        echo -e "${RED}Iris not running. Start with: iris${NC}"
        exit 1
    fi

    UUID=$("$SPELLS_DIR/spawn.sh" "$@")
    SHADE_JSON=$("$SPELLS_DIR/registry.sh" get "$UUID")
    NAME=$(echo "$SHADE_JSON" | jq -r '.name')
    PANE_ID=$(echo "$SHADE_JSON" | jq -r '.pane_id')
    TASK=$(echo "$SHADE_JSON" | jq -r '.task')

    echo -e "${GREEN}Spawned ${BOLD}$NAME${NC}${GREEN} (pane $PANE_ID)${NC}"
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
        # Kill all shade tabs (not Iris - first tab)
        local iris_pane=$(get_iris_pane)
        local count=0

        wez_cli list --format json | jq -r '.[].pane_id' | while read pane_id; do
            if [ "$pane_id" != "$iris_pane" ]; then
                wez_cli kill-pane --pane-id "$pane_id" 2>/dev/null && ((count++)) || true
            fi
        done

        echo -e "${GREEN}Killed all shades${NC}"
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

    echo -e "${BOLD}Output from $name (pane $PANE_ID):${NC}"
    echo "─────────────────────────────────────────"
    wez_cli get-text --pane-id "$PANE_ID" 2>/dev/null | tail -"$lines"
    echo "─────────────────────────────────────────"
}

# Stop Iris
cmd_stop() {
    if ! iris_running; then
        echo -e "${YELLOW}Iris is not running${NC}"
        exit 0
    fi

    echo -e "${YELLOW}Stopping Iris...${NC}"

    # Kill all panes (closes WezTerm)
    wez_cli list --format json | jq -r '.[].pane_id' | while read pane_id; do
        wez_cli kill-pane --pane-id "$pane_id" 2>/dev/null || true
    done

    # Clear registry
    "$SPELLS_DIR/registry.sh" clear

    echo -e "${GREEN}Iris stopped${NC}"
}

# Help
cmd_help() {
    echo -e "${BOLD}Iris CLI${NC} - Shade management (WezTerm)"
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
