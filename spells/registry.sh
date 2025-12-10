#!/bin/bash
# Registry operations - manage shade state in JSON
# Usage:
#   registry.sh add <uuid> <pane_id> <name> <task> [project]  - Add shade
#   registry.sh remove <uuid>                                  - Remove shade (to history)
#   registry.sh complete <uuid> <summary>                      - Mark complete (to history)
#   registry.sh lookup <name>                                  - Find UUID by name
#   registry.sh get <uuid>                                     - Get shade info (JSON)
#   registry.sh list [--all]                                   - List active (or all)
#   registry.sh update <uuid> <field> <value>                  - Update a field

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGISTRY="$SCRIPT_DIR/sessions/registry.json"

# Ensure registry exists
init_registry() {
    mkdir -p "$(dirname "$REGISTRY")"
    if [ ! -f "$REGISTRY" ]; then
        echo '{"active":{},"history":[]}' > "$REGISTRY"
    fi
}

case "$1" in
    add)
        init_registry
        UUID="$2"
        PANE_ID="$3"
        NAME="$4"
        TASK="$5"
        PROJECT="${6:-}"

        if [ -z "$UUID" ] || [ -z "$PANE_ID" ] || [ -z "$NAME" ]; then
            echo "Usage: registry.sh add <uuid> <pane_id> <name> <task> [project]" >&2
            exit 1
        fi

        jq --arg uuid "$UUID" \
           --arg pane "$PANE_ID" \
           --arg name "$NAME" \
           --arg task "$TASK" \
           --arg project "$PROJECT" \
           --arg time "$(date -Iseconds)" \
           '.active[$uuid] = {
             uuid: $uuid,
             pane_id: $pane,
             name: $name,
             task: $task,
             project: $project,
             spawned_at: $time,
             status: "starting"
           }' "$REGISTRY" > "/tmp/registry.$$.json" && mv "/tmp/registry.$$.json" "$REGISTRY"
        ;;

    remove)
        init_registry
        UUID="$2"
        jq --arg uuid "$UUID" \
           --arg time "$(date -Iseconds)" \
           'if .active[$uuid] then
              .history += [.active[$uuid] + {died_at: $time, outcome: "killed"}] |
              del(.active[$uuid])
            else . end' \
           "$REGISTRY" > "/tmp/registry.$$.json" && mv "/tmp/registry.$$.json" "$REGISTRY"
        ;;

    complete)
        init_registry
        UUID="$2"
        SUMMARY="${3:-Done}"
        jq --arg uuid "$UUID" \
           --arg time "$(date -Iseconds)" \
           --arg summary "$SUMMARY" \
           'if .active[$uuid] then
              .history += [.active[$uuid] + {died_at: $time, outcome: "completed", summary: $summary}] |
              del(.active[$uuid])
            else . end' \
           "$REGISTRY" > "/tmp/registry.$$.json" && mv "/tmp/registry.$$.json" "$REGISTRY"
        ;;

    lookup)
        init_registry
        NAME="${2,,}"
        jq -r --arg name "$NAME" '
            .active | to_entries |
            map(select(.value.name | ascii_downcase == $name)) |
            if length == 1 then .[0].key
            elif length == 0 then empty
            else error("Multiple matches")
            end
        ' "$REGISTRY"
        ;;

    get)
        init_registry
        UUID="$2"
        jq -r --arg uuid "$UUID" '.active[$uuid] // empty' "$REGISTRY"
        ;;

    list)
        init_registry
        if [ "$2" = "--all" ]; then
            cat "$REGISTRY"
        else
            jq '.active' "$REGISTRY"
        fi
        ;;

    update)
        init_registry
        UUID="$2"
        FIELD="$3"
        VALUE="$4"
        jq --arg uuid "$UUID" \
           --arg field "$FIELD" \
           --arg value "$VALUE" \
           --arg time "$(date -Iseconds)" \
           '.active[$uuid][$field] = $value | .active[$uuid].last_update = $time' \
           "$REGISTRY" > "/tmp/registry.$$.json" && mv "/tmp/registry.$$.json" "$REGISTRY"
        ;;

    clear)
        init_registry
        echo '{"active":{},"history":[]}' > "$REGISTRY"
        ;;

    *)
        echo "Usage: registry.sh <add|remove|complete|lookup|get|list|update|clear>" >&2
        exit 1
        ;;
esac
