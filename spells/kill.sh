#!/bin/bash
# Kill a shade by name or UUID
# Usage: kill.sh <name-or-uuid>
#
# Composes: registry.sh, pane.sh, layout.sh

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

# Don't kill master
if [ "$PANE_ID" = "%0" ]; then
    echo "Cannot kill master pane"
    exit 1
fi

# Remove from registry
"$SCRIPT_DIR/registry.sh" remove "$UUID"

# Kill pane
"$SCRIPT_DIR/pane.sh" kill "$PANE_ID"

echo "Killed $NAME ($PANE_ID)"

# Reapply layout
sleep 0.2
"$SCRIPT_DIR/layout.sh" iris
