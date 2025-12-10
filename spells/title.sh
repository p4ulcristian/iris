#!/bin/bash
# Set shade tab title (WezTerm native)
# Usage:
#   title.sh <uuid> <task>   - UUID mode (recommended)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Expect UUID format
if [[ "$1" =~ ^[a-z]+-[0-9]{8}-[0-9]{6}-[a-f0-9]{4}$ ]]; then
    UUID="$1"
    shift
    TASK="$*"

    SHADE_JSON=$("$SCRIPT_DIR/registry.sh" get "$UUID")
    if [ -z "$SHADE_JSON" ]; then
        echo "Shade '$UUID' not found" >&2
        exit 1
    fi

    PANE_ID=$(echo "$SHADE_JSON" | jq -r '.pane_id')
    NAME=$(echo "$SHADE_JSON" | jq -r '.name')

    # Truncate task for tab title
    SHORT_TASK="${TASK:0:40}"
    [ ${#TASK} -gt 40 ] && SHORT_TASK="${SHORT_TASK}..."

    # Set WezTerm tab title
    wezterm cli set-tab-title --pane-id "$PANE_ID" "$NAME: $SHORT_TASK"

    # Update registry status
    "$SCRIPT_DIR/registry.sh" update "$UUID" "status" "working"
    "$SCRIPT_DIR/registry.sh" update "$UUID" "current_task" "$TASK"
else
    echo "Usage: title.sh <uuid> <task>" >&2
    echo "  UUID format: name-YYYYMMDD-HHMMSS-xxxx" >&2
    exit 1
fi
