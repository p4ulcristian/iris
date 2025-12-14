#!/usr/bin/env bash
# Start the Iris Hear server

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAIN_DIR="$(dirname "$SCRIPT_DIR")"
IRIS_DIR="$(dirname "$BRAIN_DIR")"
VENV_DIR="$BRAIN_DIR/.venv"

# Activate venv
if [[ ! -d "$VENV_DIR" ]]; then
    echo "Error: Virtual environment not found at $VENV_DIR"
    echo "Run: python -m venv $VENV_DIR && source $VENV_DIR/bin/activate && pip install flask nemo_toolkit[asr] sounddevice soundfile numpy"
    exit 1
fi

source "$VENV_DIR/bin/activate"

# Start server from iris dir so brain module is findable
cd "$IRIS_DIR"
exec python "$SCRIPT_DIR/server.py"
