#!/bin/bash
# Theme picker with live preview

cd /home/p4ulcristian/Work/iris

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
