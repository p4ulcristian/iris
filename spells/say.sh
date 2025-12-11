#!/bin/bash
# Usage: ./say.sh "text to speak" [speed] [volume] [voice]
# Sends to Echo server which queues playback (no overlap)
# speed: playback speed (default 1.0)
# volume: 0-100 (default from server)
# voice: voice description for Maya TTS (default from settings.json)

TEXT="$1"
if [ -z "$TEXT" ]; then
    exit 0
fi

SPEED="${2:-1.0}"
VOLUME="${3:-}"
VOICE="${4:-}"

ECHO_SERVER="http://127.0.0.1:8765"

# Build JSON payload
JSON="{\"text\": $(printf '%s' "$TEXT" | jq -Rs .), \"speed\": $SPEED"
[ -n "$VOLUME" ] && JSON="$JSON, \"volume\": $VOLUME"
[ -n "$VOICE" ] && JSON="$JSON, \"voice\": $(printf '%s' "$VOICE" | jq -Rs .)"
JSON="$JSON}"

curl -s -X POST "$ECHO_SERVER/speak" \
    -H "Content-Type: application/json" \
    -d "$JSON"
