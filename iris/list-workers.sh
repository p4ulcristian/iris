#!/bin/bash
# List all workers (active and optionally history)
# Usage: list-workers.sh [--all] [--json]
#
# Options:
#   --all   Include history (completed/killed workers)
#   --json  Output raw JSON instead of formatted text

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGISTRY="$SCRIPT_DIR/sessions/registry.json"

SHOW_ALL=false
JSON_OUTPUT=false

for arg in "$@"; do
    case "$arg" in
        --all) SHOW_ALL=true ;;
        --json) JSON_OUTPUT=true ;;
    esac
done

if [ ! -f "$REGISTRY" ]; then
    echo "No registry found"
    exit 1
fi

if [ "$JSON_OUTPUT" = true ]; then
    if [ "$SHOW_ALL" = true ]; then
        cat "$REGISTRY"
    else
        jq '.active' "$REGISTRY"
    fi
else
    echo "=== Active Workers ==="
    ACTIVE_COUNT=$(jq '.active | length' "$REGISTRY")
    if [ "$ACTIVE_COUNT" -eq 0 ]; then
        echo "  (none)"
    else
        jq -r '.active | to_entries | .[] |
            "\(.value.name) (\(.key))\n  Status: \(.value.status)\n  Task: \(.value.task)\n  Pane: \(.value.pane_id)\n  Since: \(.value.spawned_at)\n"
        ' "$REGISTRY"
    fi

    if [ "$SHOW_ALL" = true ]; then
        echo ""
        echo "=== History ==="
        HISTORY_COUNT=$(jq '.history | length' "$REGISTRY")
        if [ "$HISTORY_COUNT" -eq 0 ]; then
            echo "  (none)"
        else
            jq -r '.history | reverse | .[] |
                "\(.name) (\(.uuid))\n  Outcome: \(.outcome)\n  Task: \(.task)\n  Summary: \(.summary // "N/A")\n  Lived: \(.spawned_at) → \(.died_at)\n"
            ' "$REGISTRY"
        fi
    fi
fi
