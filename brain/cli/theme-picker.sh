#!/bin/bash
# Theme picker with live preview

# Self-locate: script is in brain/cli/, so go up 2 levels
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IRIS_DIR="${IRIS_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
cd "$IRIS_DIR"

# Use vendored fzf if available, otherwise system fzf
ARCH=$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
FZF="$IRIS_DIR/vendor/bin/fzf-${OS}-${ARCH}"
[[ ! -x "$FZF" ]] && FZF="fzf"

# Check if fzf exists
if ! command -v "$FZF" &>/dev/null && [[ ! -x "$FZF" ]]; then
    echo "fzf not found!"
    echo ""
    echo "Install with:"
    echo "  macOS: brew install fzf"
    echo "  Linux: sudo pacman -S fzf (or apt install fzf)"
    echo ""
    read -n 1
    exit 1
fi

# Save current theme
ORIGINAL=$(python -m brain.cli.theme current)

# Run fzf with live preview on selection change
SELECTED=$(python -m brain.cli.theme list | tail -n +2 | sed 's/^ *//' | sed 's/ \*$//' | \
    "$FZF" --height=100% \
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
