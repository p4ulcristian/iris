#!/bin/bash
# Run the 3D eye test
cd "$(dirname "$0")"
source .venv/bin/activate
LD_PRELOAD=/usr/lib/libgtk4-layer-shell.so python eye_test.py
