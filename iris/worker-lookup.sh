#!/bin/bash
# Find worker by name, returning UUID
# Usage: worker-lookup.sh <name> [--all]
#
# Options:
#   --all   Include history (not just active workers)
#
# Returns UUID of matching active worker, or error if ambiguous/not found

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGISTRY="$SCRIPT_DIR/sessions/registry.json"

NAME="${1,,}"  # lowercase
SHOW_ALL="${2:-}"

if [ -z "$NAME" ]; then
    echo "Usage: worker-lookup.sh <name> [--all]"
    exit 1
fi

if [ ! -f "$REGISTRY" ]; then
    echo "No registry found" >&2
    exit 1
fi

if [ "$SHOW_ALL" = "--all" ]; then
    # Show all matches including history
    echo "=== Active ==="
    jq -r --arg name "$NAME" '
        .active | to_entries |
        map(select(.value.name | ascii_downcase == $name)) |
        if length == 0 then "  (none)"
        else .[] | "  \(.key) - \(.value.task)" end
    ' "$REGISTRY"

    echo ""
    echo "=== History ==="
    jq -r --arg name "$NAME" '
        .history |
        map(select(.name | ascii_downcase == $name)) |
        if length == 0 then "  (none)"
        else .[] | "  \(.uuid) - \(.task) [\(.outcome)]" end
    ' "$REGISTRY"
else
    # Active only - return UUID if exactly one match
    MATCHES=$(jq -r --arg name "$NAME" '
        .active | to_entries |
        map(select(.value.name | ascii_downcase == $name)) | length
    ' "$REGISTRY")

    if [ "$MATCHES" -eq 1 ]; then
        jq -r --arg name "$NAME" '
            .active | to_entries |
            map(select(.value.name | ascii_downcase == $name))[0].key
        ' "$REGISTRY"
    elif [ "$MATCHES" -eq 0 ]; then
        echo "No active worker named '$NAME'" >&2
        exit 1
    else
        echo "Multiple active workers named '$NAME':" >&2
        jq -r --arg name "$NAME" '
            .active | to_entries |
            map(select(.value.name | ascii_downcase == $name)) |
            .[] | "  \(.key) - \(.value.task)"
        ' "$REGISTRY" >&2
        exit 1
    fi
fi
