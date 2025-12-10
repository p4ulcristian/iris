#!/bin/bash
# List all shades
# Usage: list.sh [--all] [--json]
#
# Queries tmux pane titles for active shades
# Reads shadows/ folders for history
#
# Status icons:
#   ▶ laboring (working)
#   ◉ dormant (idle)
#   ✦ fulfilled (done)
#   ⚡ scattered (crashed)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IRIS_DIR="$HOME/Iris"
SHADOWS_DIR="$IRIS_DIR/shadows"

SHOW_ALL=false
JSON_OUTPUT=false

for arg in "$@"; do
    case "$arg" in
        --all) SHOW_ALL=true ;;
        --json) JSON_OUTPUT=true ;;
    esac
done

# Status icon mapping
get_status_icon() {
    case "$1" in
        laboring|working|busy) echo "▶" ;;
        dormant|idle)          echo "◉" ;;
        fulfilled|done)        echo "✦" ;;
        scattered|crashed)     echo "⚡" ;;
        *)                     echo "▶" ;;  # default to laboring
    esac
}

# Get active shades from tmux pane titles
# Format: Name|uuid|project
get_active_shades() {
    local result='{'
    local first=true

    while IFS=: read -r pane_id title; do
        # Skip Iris pane and non-shade titles
        [[ "$title" == Iris* ]] && continue
        [[ "$title" != *"|"* ]] && continue

        # Parse title: Name|uuid|project
        IFS='|' read -r name uuid project <<< "$title"
        [[ -z "$uuid" ]] && continue

        # Read additional info from shadows folder
        local shadow_dir="$SHADOWS_DIR/$uuid"
        local task=""
        local spawned=""
        local status="laboring"
        local current_task=""

        if [ -d "$shadow_dir" ]; then
            [ -f "$shadow_dir/task.txt" ] && task=$(cat "$shadow_dir/task.txt")
            [ -f "$shadow_dir/spawned.txt" ] && spawned=$(cat "$shadow_dir/spawned.txt")
            [ -f "$shadow_dir/status.txt" ] && status=$(cat "$shadow_dir/status.txt")
            [ -f "$shadow_dir/current_task.txt" ] && current_task=$(cat "$shadow_dir/current_task.txt")
        fi

        local status_icon=$(get_status_icon "$status")

        $first || result+=','
        first=false

        result+="\"$uuid\":"
        result+=$(jq -n \
            --arg uuid "$uuid" \
            --arg pane "$pane_id" \
            --arg name "$name" \
            --arg task "$task" \
            --arg current_task "$current_task" \
            --arg project "$project" \
            --arg spawned "$spawned" \
            --arg status "$status" \
            --arg status_icon "$status_icon" \
            '{uuid: $uuid, pane_id: $pane, name: $name, task: $task, current_task: $current_task, project: $project, spawned_at: $spawned, status: $status, status_icon: $status_icon}')
    done < <(tmux list-panes -t iris -F '#{pane_id}:#{pane_title}' 2>/dev/null)

    result+='}'
    echo "$result"
}

# Get history from shadows folders (those without active panes)
get_history() {
    local active_uuids
    active_uuids=$(tmux list-panes -t iris -F '#{pane_title}' 2>/dev/null | grep '|' | cut -d'|' -f2)

    local result='['
    local first=true

    for shadow_dir in "$SHADOWS_DIR"/*/; do
        [ -d "$shadow_dir" ] || continue

        uuid=$(basename "$shadow_dir")

        # Skip if still active
        echo "$active_uuids" | grep -q "^$uuid$" && continue

        local name="" task="" project="" spawned="" outcome="unknown"

        [ -f "$shadow_dir/name.txt" ] && name=$(cat "$shadow_dir/name.txt")
        [ -f "$shadow_dir/task.txt" ] && task=$(cat "$shadow_dir/task.txt")
        [ -f "$shadow_dir/project.txt" ] && project=$(cat "$shadow_dir/project.txt")
        [ -f "$shadow_dir/spawned.txt" ] && spawned=$(cat "$shadow_dir/spawned.txt")
        [ -f "$shadow_dir/outcome.txt" ] && outcome=$(cat "$shadow_dir/outcome.txt")

        $first || result+=','
        first=false

        result+=$(jq -n \
            --arg uuid "$uuid" \
            --arg name "$name" \
            --arg task "$task" \
            --arg project "$project" \
            --arg spawned "$spawned" \
            --arg outcome "$outcome" \
            '{uuid: $uuid, name: $name, task: $task, project: $project, spawned_at: $spawned, outcome: $outcome}')
    done

    result+=']'
    echo "$result"
}

if [ "$JSON_OUTPUT" = true ]; then
    if [ "$SHOW_ALL" = true ]; then
        jq -n --argjson active "$(get_active_shades)" --argjson history "$(get_history)" \
            '{active: $active, history: $history}'
    else
        get_active_shades
    fi
else
    echo "=== Active Shades ==="
    ACTIVE_JSON=$(get_active_shades)
    ACTIVE_COUNT=$(echo "$ACTIVE_JSON" | jq 'length')

    if [ "$ACTIVE_COUNT" -eq 0 ]; then
        echo "  (none)"
    else
        echo "$ACTIVE_JSON" | jq -r 'to_entries | .[] |
            "\(.value.status_icon) \(.value.name) (\(.value.pane_id))\n  Task: \(.value.task)\n  Current: \(.value.current_task // "—")\n"
        '
    fi

    if [ "$SHOW_ALL" = true ]; then
        echo "=== History ==="
        HISTORY_JSON=$(get_history)
        HISTORY_COUNT=$(echo "$HISTORY_JSON" | jq 'length')

        if [ "$HISTORY_COUNT" -eq 0 ]; then
            echo "  (none)"
        else
            echo "$HISTORY_JSON" | jq -r '.[] |
                "\(.name) - \(.outcome)\n  Task: \(.task)\n"
            '
        fi
    fi
fi
