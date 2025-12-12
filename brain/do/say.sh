#!/bin/bash
# Usage: ./say.sh "voice description" "text to speak"
# Sends to Iris Speak server

VOICE="$1"
TEXT="$2"

if [ -z "$VOICE" ] || [ -z "$TEXT" ]; then
    echo "Usage: ./say.sh \"voice description\" \"text to speak\""
    exit 1
fi

SPEAK_SERVER="http://127.0.0.1:8765"

# Build JSON payload
JSON="{\"text\": $(printf '%s' "$TEXT" | jq -Rs .), \"voice\": $(printf '%s' "$VOICE" | jq -Rs .)}"

curl -s -X POST "$SPEAK_SERVER/speak" \
    -H "Content-Type: application/json" \
    -d "$JSON"
