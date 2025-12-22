#!/bin/bash
# Returns the next available realm name for a new window

REALMS=(
    "Olympus"
    "Tartarus"
    "Elysium"
    "Delphi"
    "Arcadia"
    "Thessaly"
    "Ithaca"
    "Crete"
    "Styx"
)

# Get current window names
USED=$(tmux list-windows -F "#{window_name}" 2>/dev/null)

# Find first unused realm
for realm in "${REALMS[@]}"; do
    if ! echo "$USED" | grep -q "^${realm}$"; then
        echo "$realm"
        exit 0
    fi
done

# Fallback: use number if all realms used
COUNT=$(tmux list-windows 2>/dev/null | wc -l)
echo "Realm-$((COUNT + 1))"
