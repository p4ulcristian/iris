#!/bin/bash
# Kill a shade by name or UUID (WezTerm native)
# Usage: kill.sh <name-or-uuid>
#
# Composes: registry.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

INPUT="$1"

if [ -z "$INPUT" ]; then
    echo "Usage: kill.sh <name-or-uuid>"
    exit 1
fi

# Determine if input is UUID or name
if [[ "$INPUT" =~ ^[a-z]+-[0-9]{8}-[0-9]{6}-[a-f0-9]{4}$ ]]; then
    UUID="$INPUT"
else
    # Look up UUID by name
    UUID=$("$SCRIPT_DIR/registry.sh" lookup "$INPUT")
    if [ -z "$UUID" ]; then
        echo "Shade '$INPUT' not found"
        exit 1
    fi
fi

# Get shade info
SHADE_JSON=$("$SCRIPT_DIR/registry.sh" get "$UUID")
if [ -z "$SHADE_JSON" ]; then
    echo "Shade '$UUID' not found in registry"
    exit 1
fi

PANE_ID=$(echo "$SHADE_JSON" | jq -r '.pane_id')
NAME=$(echo "$SHADE_JSON" | jq -r '.name')

# Remove from registry
"$SCRIPT_DIR/registry.sh" remove "$UUID"

# Kill WezTerm pane (which closes the tab if it's the only pane)
wezterm cli kill-pane --pane-id "$PANE_ID" 2>/dev/null || true

echo "Killed $NAME (pane $PANE_ID)"
