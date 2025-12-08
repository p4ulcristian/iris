#!/bin/bash
# Keeps HomePod awake by playing inaudible audio
# Usage: ./keep-awake.sh (Ctrl+C to stop)

echo "Playing silent audio to keep HomePod awake... (Ctrl+C to stop)"
ffplay -f lavfi -i "sine=f=50,volume=0.05" -nodisp -loglevel quiet
