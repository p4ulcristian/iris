#!/usr/bin/env bash
# Start the Iris Speak server

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Use vibevoice venv which has all TTS deps (torch 2.5.1 + flash-attn)
VENV_DIR="/home/p4ulcristian/Work/vibevoice/.venv"

# Activate venv
if [[ ! -d "$VENV_DIR" ]]; then
    echo "Error: Virtual environment not found at $VENV_DIR"
    echo "Please set up vibevoice first"
    exit 1
fi

source "$VENV_DIR/bin/activate"

# GPU settings for TTS
export CUDA_DEVICE_ORDER=PCI_BUS_ID
export CUDA_VISIBLE_DEVICES=1  # RTX 3080

# Start server
exec python "$SCRIPT_DIR/server.py"
