#!/bin/bash
# Kill an Iris worker by name or UUID
# Usage: kill-worker.sh <name-or-uuid>
# Example: kill-worker.sh Neil
# Example: kill-worker.sh neil-20251209-143027-x7k2

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGISTRY="$SCRIPT_DIR/sessions/registry.json"

INPUT="$1"

if [ -z "$INPUT" ]; then
    echo "Usage: kill-worker.sh <name-or-uuid>"
    echo "Available workers:"
    tmux list-panes -t iris -F '#{pane_id} #{pane_title}' | grep -v '%0 ' | sed 's/.*bold\] /  /' | sed 's/ -.*//'
    exit 1
fi

UUID=""
PANE_ID=""
NAME=""

# Check if input is a UUID
if [[ "$INPUT" =~ ^[a-z]+-[0-9]{8}-[0-9]{6}-[a-f0-9]{4}$ ]]; then
    UUID="$INPUT"
    # Look up from registry
    if [ -f "$REGISTRY" ]; then
        WORKER_INFO=$(jq -r --arg uuid "$UUID" '.active[$uuid] // empty' "$REGISTRY")
        if [ -n "$WORKER_INFO" ]; then
            NAME=$(echo "$WORKER_INFO" | jq -r '.name')
            PANE_ID=$(echo "$WORKER_INFO" | jq -r '.pane_id')
        fi
    fi
else
    # Input is a name - find matching worker
    NAME="$INPUT"

    # First try registry
    if [ -f "$REGISTRY" ]; then
        MATCHES=$(jq -r --arg name "$INPUT" '
            .active | to_entries |
            map(select(.value.name | ascii_downcase == ($name | ascii_downcase)))
        ' "$REGISTRY")
        MATCH_COUNT=$(echo "$MATCHES" | jq 'length')

        if [ "$MATCH_COUNT" -eq 1 ]; then
            UUID=$(echo "$MATCHES" | jq -r '.[0].key')
            NAME=$(echo "$MATCHES" | jq -r '.[0].value.name')
            PANE_ID=$(echo "$MATCHES" | jq -r '.[0].value.pane_id')
        elif [ "$MATCH_COUNT" -gt 1 ]; then
            echo "Multiple active workers named '$INPUT':"
            echo "$MATCHES" | jq -r '.[] | "  \(.key) - \(.value.task)"'
            exit 1
        fi
    fi

    # Fallback to tmux title search if not found in registry
    if [ -z "$PANE_ID" ]; then
        PANE_ID=$(tmux list-panes -t iris -F '#{pane_id} #{pane_title}' | grep -i "$INPUT" | head -1 | awk '{print $1}')
    fi
fi

if [ -z "$PANE_ID" ]; then
    echo "Worker '$INPUT' not found"
    echo "Available workers:"
    tmux list-panes -t iris -F '#{pane_id} #{pane_title}' | grep -v '%0 ' | sed 's/.*bold\] /  /' | sed 's/ -.*//'
    exit 1
fi

# Don't kill master pane
if [ "$PANE_ID" = "%0" ]; then
    echo "Can't kill master pane!"
    exit 1
fi

# Move from active to history in registry before killing
if [ -n "$UUID" ] && [ -f "$REGISTRY" ]; then
    jq --arg uuid "$UUID" \
       --arg time "$(date -Iseconds)" \
       'if .active[$uuid] then
          .history += [.active[$uuid] + {died_at: $time, outcome: "killed"}] |
          del(.active[$uuid])
        else . end' \
       "$REGISTRY" > "/tmp/registry.$$.json" && mv "/tmp/registry.$$.json" "$REGISTRY"
fi

# Kill the pane
tmux kill-pane -t "$PANE_ID"
echo "Killed worker ${NAME:-$INPUT} ($PANE_ID)"

# Realign layout for remaining panes
sleep 0.2
"$SCRIPT_DIR/smart-layout.sh" iris
