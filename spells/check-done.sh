#!/bin/bash
# Check for new worker completions (for Iris to call)
# Returns new completions since last check

DONE_FILE="/tmp/iris-workers-done"
LAST_READ="/tmp/iris-last-read"

# Initialize if needed
[ ! -f "$DONE_FILE" ] && touch "$DONE_FILE"
[ ! -f "$LAST_READ" ] && echo "0" > "$LAST_READ"

LAST_LINE=$(cat "$LAST_READ")
CURRENT_LINES=$(wc -l < "$DONE_FILE")

if [ "$CURRENT_LINES" -gt "$LAST_LINE" ]; then
    # Output new entries
    tail -n +$((LAST_LINE + 1)) "$DONE_FILE"
    # Update last read
    echo "$CURRENT_LINES" > "$LAST_READ"
fi
