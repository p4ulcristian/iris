#!/bin/bash

# StarVector Draw Service Setup
# Run this once to set up the environment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Setting up StarVector Draw Service ==="

# Check if uv is available
if ! command -v uv &> /dev/null; then
    echo "Error: uv not found. Installing..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
fi

# Create virtual environment with Python 3.11 (required for StarVector)
echo "Creating virtual environment with Python 3.11..."
uv venv --python 3.11 .venv

# Activate venv
source .venv/bin/activate

# Install PyTorch with CUDA (need 2.9+ for RTX 50 series / Blackwell GPUs)
echo "Installing PyTorch 2.9+ with CUDA support..."
uv pip install "torch>=2.9" "torchvision>=0.20" --index-url https://download.pytorch.org/whl/cu128

# Install other dependencies
echo "Installing dependencies..."
uv pip install transformers accelerate pillow einops timm flask flask-cors

# Clone StarVector if not exists
if [ ! -d "star-vector" ]; then
    echo "Cloning StarVector repository..."
    git clone https://github.com/joanrod/star-vector.git
fi

# Install StarVector
echo "Installing StarVector..."
cd star-vector
uv pip install -e .
cd ..

echo ""
echo "=== Setup complete! ==="
echo ""
echo "The Draw service will now use the real StarVector model."
echo "Restart the Draw service from the Powers panel."
echo ""
