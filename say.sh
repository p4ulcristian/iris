#!/bin/bash
# Usage: ./say.sh "text to speak"
# Sends to Iris server which queues playback (no overlap)

TEXT="$1"
if [ -z "$TEXT" ]; then
    exit 0
fi

IRIS_SERVER="http://127.0.0.1:8765"

curl -s -X POST "$IRIS_SERVER/speak" \
    -H "Content-Type: application/json" \
    -d "{\"text\": $(printf '%s' "$TEXT" | jq -Rs .)}"
