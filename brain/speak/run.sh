#!/usr/bin/env bash
# Start the Iris Speak server

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Use local .venv symlink (points to test_chatterbox/.venv with chatterbox-tts)
VENV_DIR="$SCRIPT_DIR/.venv"

# Activate venv
if [[ ! -d "$VENV_DIR" ]]; then
    echo "Error: Virtual environment not found at $VENV_DIR"
    echo "Please create .venv symlink or set up chatterbox venv"
    exit 1
fi

source "$VENV_DIR/bin/activate"

# GPU settings for TTS
export CUDA_DEVICE_ORDER=PCI_BUS_ID
export CUDA_VISIBLE_DEVICES=0  # RTX 3080

# Start server
exec python "$SCRIPT_DIR/server.py"
