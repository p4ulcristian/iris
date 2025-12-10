#!/bin/bash
# Worker calls this when finished with a task
# Usage: worker-done.sh <uuid> [summary]
# Example: worker-done.sh fred-20251209-143027-x7k2 "Fixed the bug"
#
# Legacy usage (still supported): worker-done.sh <pane_id> <name> <color_hex> [summary]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGISTRY="$SCRIPT_DIR/sessions/registry.json"

# Detect if using new UUID format or legacy format
if [[ "$1" =~ ^[a-z]+-[0-9]{8}-[0-9]{6}-[a-f0-9]{4}$ ]]; then
    # New UUID format
    UUID="$1"
    shift
    SUMMARY="${*:-Done}"

    # Look up worker info from registry
    if [ -f "$REGISTRY" ]; then
        WORKER_INFO=$(jq -r --arg uuid "$UUID" '.active[$uuid] // empty' "$REGISTRY")
        if [ -n "$WORKER_INFO" ]; then
            NAME=$(echo "$WORKER_INFO" | jq -r '.name')
            COLOR=$(echo "$WORKER_INFO" | jq -r '.color')
            PANE_ID=$(echo "$WORKER_INFO" | jq -r '.pane_id')
        else
            echo "Worker $UUID not found in registry"
            exit 1
        fi
    else
        echo "Registry not found"
        exit 1
    fi
else
    # Legacy format: pane_id name color [summary]
    PANE_ID="$1"
    NAME="$2"
    COLOR="$3"
    shift 3
    SUMMARY="${*:-Done}"
    UUID=""

    if [ -z "$PANE_ID" ] || [ -z "$NAME" ] || [ -z "$COLOR" ]; then
        echo "Usage: worker-done.sh <uuid> [summary]"
        echo "   or: worker-done.sh <pane_id> <name> <color_hex> [summary]"
        exit 1
    fi
fi

# Update title to show done
tmux select-pane -t "$PANE_ID" -T "#[bg=$COLOR,fg=white,bold] $NAME ✓ $SUMMARY "

# Write to done file for Iris to check (legacy notification)
echo "$PANE_ID|$NAME|$SUMMARY|$(date +%H:%M:%S)" >> /tmp/iris-workers-done

# Move from active to history in registry (if UUID known)
if [ -n "$UUID" ] && [ -f "$REGISTRY" ]; then
    jq --arg uuid "$UUID" \
       --arg time "$(date -Iseconds)" \
       --arg summary "$SUMMARY" \
       'if .active[$uuid] then
          .history += [.active[$uuid] + {died_at: $time, outcome: "completed", summary: $summary}] |
          del(.active[$uuid])
        else . end' \
       "$REGISTRY" > "/tmp/registry.$$.json" && mv "/tmp/registry.$$.json" "$REGISTRY"
fi
