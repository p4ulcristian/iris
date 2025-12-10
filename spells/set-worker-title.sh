#!/bin/bash
# Set worker pane title with colored name
# Usage: set-worker-title.sh <uuid> <task>
# Example: set-worker-title.sh fred-20251209-143027-x7k2 "Fixing bug"
#
# Legacy usage (still supported): set-worker-title.sh <pane_id> <name> <color_hex> <task>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGISTRY="$SCRIPT_DIR/sessions/registry.json"

# Detect if using new UUID format or legacy format
if [[ "$1" =~ ^[a-z]+-[0-9]{8}-[0-9]{6}-[a-f0-9]{4}$ ]]; then
    # New UUID format
    UUID="$1"
    shift
    TASK="$*"

    # Look up worker info from registry
    if [ -f "$REGISTRY" ]; then
        WORKER_INFO=$(jq -r --arg uuid "$UUID" '.active[$uuid] // empty' "$REGISTRY")
        if [ -n "$WORKER_INFO" ]; then
            NAME=$(echo "$WORKER_INFO" | jq -r '.name')
            COLOR=$(echo "$WORKER_INFO" | jq -r '.color')
            PANE_ID=$(echo "$WORKER_INFO" | jq -r '.pane_id')

            # Update status in registry
            jq --arg uuid "$UUID" \
               --arg task "$TASK" \
               --arg time "$(date -Iseconds)" \
               '.active[$uuid].status = "working" |
                .active[$uuid].current_task = $task |
                .active[$uuid].last_update = $time' \
               "$REGISTRY" > "/tmp/registry.$$.json" && mv "/tmp/registry.$$.json" "$REGISTRY"
        else
            echo "Worker $UUID not found in registry"
            exit 1
        fi
    else
        echo "Registry not found"
        exit 1
    fi
else
    # Legacy format: pane_id name color task
    PANE_ID="$1"
    NAME="$2"
    COLOR="$3"
    shift 3
    TASK="$*"

    if [ -z "$PANE_ID" ] || [ -z "$NAME" ] || [ -z "$COLOR" ]; then
        echo "Usage: set-worker-title.sh <uuid> <task>"
        echo "   or: set-worker-title.sh <pane_id> <name> <color_hex> <task>"
        exit 1
    fi
fi

tmux select-pane -t "$PANE_ID" -T "#[bg=$COLOR,fg=white,bold] $NAME - $TASK "
