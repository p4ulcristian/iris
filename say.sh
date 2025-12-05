#!/bin/bash
# Usage: ./say.sh "text to speak" [speed] [volume]
# Sends to Iris server which queues playback (no overlap)
# speed: playback speed (default 1.0)
# volume: 0-100 (default 70)

TEXT="$1"
if [ -z "$TEXT" ]; then
    exit 0
fi

SPEED="${2:-1.0}"
VOLUME="${3:-}"

IRIS_SERVER="http://127.0.0.1:8765"

if [ -n "$VOLUME" ]; then
    curl -s -X POST "$IRIS_SERVER/speak" \
        -H "Content-Type: application/json" \
        -d "{\"text\": $(printf '%s' "$TEXT" | jq -Rs .), \"speed\": $SPEED, \"volume\": $VOLUME}"
else
    curl -s -X POST "$IRIS_SERVER/speak" \
        -H "Content-Type: application/json" \
        -d "{\"text\": $(printf '%s' "$TEXT" | jq -Rs .), \"speed\": $SPEED}"
fi
