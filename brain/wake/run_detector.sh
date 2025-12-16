#!/usr/bin/env bash
# Start the Iris Wake Word Detector (hey iris)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAIN_DIR="$(dirname "$SCRIPT_DIR")"
IRIS_DIR="$(dirname "$BRAIN_DIR")"

# Start detector from iris dir so brain module is findable
cd "$IRIS_DIR"

# Use uv to run with required packages
exec uv run \
    --with numpy --with onnxruntime --with scipy --with sounddevice \
    --with tqdm --with requests --with scikit-learn --with resampy \
    --with torch --with torchaudio \
    python "$SCRIPT_DIR/detector.py"
