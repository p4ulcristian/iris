#!/bin/bash
# Main menu popup
# Opens fzf with iris actions

# Self-locate
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IRIS_DIR="${IRIS_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
cd "$IRIS_DIR"

# Use vendored fzf if available
ARCH=$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
FZF="$IRIS_DIR/vendor/bin/fzf-${OS}-${ARCH}"
[[ ! -x "$FZF" ]] && FZF="fzf"

# Menu options
OPTIONS=" New God Pane
 New God Tab
 History
 New Terminal
 Banish Pane
 Skills
 Shortcuts
 Theme"

# Show menu
SELECTED=$(echo "$OPTIONS" | \
    "$FZF" --height=100% \
        --no-info \
        --pointer='>' \
        --prompt='' \
        --layout=reverse)

[ -z "$SELECTED" ] && exit 0

# Run selected action
case "$SELECTED" in
    *"New God Pane"*)  exec "$SCRIPT_DIR/spawn-picker.sh" ;;
    *"New God Tab"*)   exec "$SCRIPT_DIR/spawn-picker.sh" --new-tab ;;
    *"History"*)       exec "$SCRIPT_DIR/resume-picker.sh" ;;
    *"New Terminal"*)  tmux split-window -c "$IRIS_DIR" ;;
    *"Banish Pane"*)   exec "$SCRIPT_DIR/banish-picker.sh" ;;
    *"Skills"*)        cat "$SCRIPT_DIR/skills.txt"; read -n 1 ;;
    *"Shortcuts"*)     cat "$SCRIPT_DIR/hotkeys.txt"; read -n 1 ;;
    *"Theme"*)         exec "$SCRIPT_DIR/theme-picker.sh" ;;
esac
