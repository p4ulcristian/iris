#!/bin/bash
# List all shades
# Usage: list.sh [--all] [--json]
#
# Composes: registry.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SHOW_ALL=false
JSON_OUTPUT=false

for arg in "$@"; do
    case "$arg" in
        --all) SHOW_ALL=true ;;
        --json) JSON_OUTPUT=true ;;
    esac
done

if [ "$JSON_OUTPUT" = true ]; then
    if [ "$SHOW_ALL" = true ]; then
        "$SCRIPT_DIR/registry.sh" list --all
    else
        "$SCRIPT_DIR/registry.sh" list
    fi
else
    REGISTRY_JSON=$("$SCRIPT_DIR/registry.sh" list --all)

    echo "=== Active Shades ==="
    ACTIVE_COUNT=$(echo "$REGISTRY_JSON" | jq '.active | length')
    if [ "$ACTIVE_COUNT" -eq 0 ]; then
        echo "  (none)"
    else
        echo "$REGISTRY_JSON" | jq -r '.active | to_entries | .[] |
            "\(.value.name) (\(.key))\n  Task: \(.value.task)\n  Pane: \(.value.pane_id)\n"
        '
    fi

    if [ "$SHOW_ALL" = true ]; then
        echo "=== History ==="
        HISTORY_COUNT=$(echo "$REGISTRY_JSON" | jq '.history | length')
        if [ "$HISTORY_COUNT" -eq 0 ]; then
            echo "  (none)"
        else
            echo "$REGISTRY_JSON" | jq -r '.history | reverse | .[] |
                "\(.name) - \(.outcome)\n  Task: \(.task)\n  Summary: \(.summary // "N/A")\n"
            '
        fi
    fi
fi
