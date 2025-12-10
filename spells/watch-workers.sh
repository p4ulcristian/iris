#!/bin/bash
# Watch worker panes and notify when they go idle
# Usage: watch-workers.sh [interval_seconds]

INTERVAL="${1:-5}"
STATE_FILE="/tmp/iris-worker-states"

# Initialize state file
touch "$STATE_FILE"

check_pane_status() {
    local pane_id="$1"
    local output=$(tmux capture-pane -t "$pane_id" -p 2>/dev/null | tail -20)

    if echo "$output" | grep -q "esc to interrupt"; then
        echo "working"
    else
        echo "idle"
    fi
}

get_pane_title() {
    tmux display-message -t "$1" -p '#{pane_title}' 2>/dev/null
}

notify_master() {
    local pane_id="$1"
    local title="$2"
    # Send notification to master pane
    tmux send-keys -t %0 ""
    ./say.sh "Worker $pane_id finished: $title"
}

echo "Watching workers every ${INTERVAL}s... (Ctrl+C to stop)"

while true; do
    # Get all panes except master (%0)
    panes=$(tmux list-panes -t iris -F '#{pane_id}' 2>/dev/null | grep -v '^%0$')

    for pane in $panes; do
        current_status=$(check_pane_status "$pane")
        previous_status=$(grep "^$pane:" "$STATE_FILE" 2>/dev/null | cut -d: -f2)

        # If was working and now idle, notify
        if [ "$previous_status" = "working" ] && [ "$current_status" = "idle" ]; then
            title=$(get_pane_title "$pane")
            notify_master "$pane" "$title"
        fi

        # Update state
        grep -v "^$pane:" "$STATE_FILE" > "${STATE_FILE}.tmp" 2>/dev/null || true
        echo "$pane:$current_status" >> "${STATE_FILE}.tmp"
        mv "${STATE_FILE}.tmp" "$STATE_FILE"
    done

    sleep "$INTERVAL"
done
