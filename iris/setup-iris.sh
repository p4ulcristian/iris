#!/bin/bash
# Iris setup script - copies configs to their proper locations

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Setting up Iris..."

# Copy tmux config
if [ -f "$SCRIPT_DIR/configs/tmux.conf" ]; then
    cp "$SCRIPT_DIR/configs/tmux.conf" ~/.tmux.conf
    echo "✓ Copied tmux.conf to ~/.tmux.conf"

    # Reload tmux config if tmux is running
    if tmux info &>/dev/null; then
        tmux source-file ~/.tmux.conf
        echo "✓ Reloaded tmux config"
    fi
else
    echo "✗ tmux.conf not found in configs/"
fi

echo "Done!"
