#!/bin/bash
# Theme picker with live preview

# Self-locate: script is in brain/cli/, so go up 2 levels
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IRIS_DIR="${IRIS_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
cd "$IRIS_DIR"

# Save current theme
ORIGINAL=$(python -m brain.cli.theme current)

# Run fzf with live preview on selection change
SELECTED=$(python -m brain.cli.theme list | tail -n +2 | sed 's/^ *//' | sed 's/ \*$//' | \
    fzf --height=100% \
        --no-info \
        --no-sort \
        --pointer='▶' \
        --disabled \
        --prompt='' \
        --layout=reverse \
        --bind "focus:execute-silent(python -m brain.cli.theme {})")

# If escaped (no selection), restore original
if [ -z "$SELECTED" ]; then
    python -m brain.cli.theme "$ORIGINAL" > /dev/null
else
    # Apply selected (already applied via focus, but confirm)
    python -m brain.cli.theme "$SELECTED" > /dev/null
fi
