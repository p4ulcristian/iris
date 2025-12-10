#!/bin/bash
# Watch for worker completions and notify via speech
# Usage: watch-done.sh

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DONE_FILE="/tmp/iris-workers-done"

# Create file if doesn't exist
touch "$DONE_FILE"

# Start from current end of file (don't read old entries)
LAST_LINE=$(wc -l < "$DONE_FILE")

echo "Watching for worker completions... (Ctrl+C to stop)"

while true; do
    CURRENT_LINES=$(wc -l < "$DONE_FILE")

    if [ "$CURRENT_LINES" -gt "$LAST_LINE" ]; then
        # Read new lines
        NEW_ENTRIES=$(tail -n +$((LAST_LINE + 1)) "$DONE_FILE")

        while IFS='|' read -r pane_id name summary time; do
            if [ -n "$name" ]; then
                "$SCRIPT_DIR/say.sh" "$name finished: $summary"
            fi
        done <<< "$NEW_ENTRIES"

        LAST_LINE=$CURRENT_LINES
    fi

    sleep 2
done
