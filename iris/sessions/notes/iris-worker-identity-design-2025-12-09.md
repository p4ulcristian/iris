# Iris: Worker Identity System Design

**Worker:** fred-20251209-x7k2 (Fred)
**Date:** 2025-12-09
**Status:** completed (implemented)

## Summary

Designed and implemented a UUID-based identity system to solve worker confusion issues. Workers get permanent unique IDs, and a central registry tracks all workers (active and historical).

**Files modified:**
- `iris/sessions/registry.json` - Created (central registry)
- `iris/new-worker.sh` - Generates UUIDs, writes to registry
- `iris/worker-done.sh` - Moves completed workers to history
- `iris/kill-worker.sh` - Moves killed workers to history
- `iris/set-worker-title.sh` - Updates registry status
- `iris/list-workers.sh` - Created (list active/history)
- `iris/worker-lookup.sh` - Created (find worker by name)

## The Problem

### Current Issues
1. **Pane ID Reuse**: Tmux reuses `%ID` values when panes die - `%12` today is different from `%12` an hour ago
2. **Name Recycling**: Only 6 names rotate - "Fred" can mean different workers at different times
3. **Stale Status Files**: `worker-red.json` persists after worker dies, no way to know if current
4. **No Lifecycle Tracking**: Can't tell when workers existed, what they did, or if they're the same entity

### Confusion Scenarios
- "Ask Fred to check on that" - which Fred?
- Reading session notes referencing "worker-red" - is that still active?
- Pane %12 shows different worker than expected

## Solution: UUID-Based Identity

### Worker UUID Format
```
{name}-{YYYYMMDD}-{HHMMSS}-{random4}
Example: fred-20251209-143027-x7k2
```

Components:
- **name**: Human-friendly, lowercase (fred, neil, etc.)
- **date**: Spawn date for temporal context
- **time**: Spawn time (24h format)
- **random4**: 4 hex chars for collision prevention

### The Registry

Single source of truth: `iris/sessions/registry.json`

```json
{
  "active": {
    "fred-20251209-143027-x7k2": {
      "name": "Fred",
      "uuid": "fred-20251209-143027-x7k2",
      "pane_id": "%18",
      "spawned_at": "2025-12-09T14:30:27Z",
      "task": "Original assigned task",
      "project": "ironrainbow",
      "project_dir": "/home/paul/Work/ironrainbow",
      "status": "working",
      "color": "#8b3a3a",
      "last_update": "2025-12-09T14:45:00Z"
    }
  },
  "history": [
    {
      "uuid": "neil-20251209-121500-a3b4",
      "name": "Neil",
      "pane_id": "%12",
      "spawned_at": "2025-12-09T12:15:00Z",
      "died_at": "2025-12-09T13:42:00Z",
      "task": "Database optimization",
      "project": "ironrainbow",
      "outcome": "completed",
      "summary": "Optimized 3 queries, improved load time by 40%"
    }
  ]
}
```

## Implementation Details

### Name Resolution

When Iris receives "tell Fred to..." or "what's Fred doing?":

```bash
# Pseudocode
active_freds=$(jq '.active | to_entries | map(select(.value.name == "Fred"))' registry.json)

if count(active_freds) == 1:
    uuid = active_freds[0].uuid
    # proceed with that worker
elif count(active_freds) == 0:
    # "No active worker named Fred"
else:
    # "Multiple Freds active - which one? (list their tasks)"
```

### Lifecycle Events

**Spawn (new-worker.sh)**
```bash
UUID="${COLOR_NAME,,}-$(date +%Y%m%d-%H%M%S)-$(openssl rand -hex 2)"

# Add to registry.active
jq --arg uuid "$UUID" \
   --arg name "$COLOR_NAME" \
   --arg pane "$PANE_ID" \
   --arg task "$TASK" \
   --arg project "$PROJECT" \
   --arg project_dir "$PROJECT_DIR" \
   --arg color "$HEADER_COLOR" \
   --arg time "$(date -Iseconds)" \
   '.active[$uuid] = {
     name: $name,
     uuid: $uuid,
     pane_id: $pane,
     task: $task,
     project: $project,
     project_dir: $project_dir,
     color: $color,
     spawned_at: $time,
     status: "starting",
     last_update: $time
   }' registry.json > /tmp/reg.$$.json && mv /tmp/reg.$$.json registry.json
```

**Status Update (set-worker-title.sh or worker status update)**
```bash
jq --arg uuid "$UUID" \
   --arg status "$STATUS" \
   --arg time "$(date -Iseconds)" \
   '.active[$uuid].status = $status | .active[$uuid].last_update = $time' \
   registry.json > /tmp/reg.$$.json && mv /tmp/reg.$$.json registry.json
```

**Completion (worker-done.sh)**
```bash
jq --arg uuid "$UUID" \
   --arg time "$(date -Iseconds)" \
   --arg summary "$SUMMARY" \
   '.history += [.active[$uuid] + {died_at: $time, outcome: "completed", summary: $summary}] |
    del(.active[$uuid])' \
   registry.json > /tmp/reg.$$.json && mv /tmp/reg.$$.json registry.json
```

**Kill (kill-worker.sh)**
```bash
jq --arg uuid "$UUID" \
   --arg time "$(date -Iseconds)" \
   '.history += [.active[$uuid] + {died_at: $time, outcome: "killed"}] |
    del(.active[$uuid])' \
   registry.json > /tmp/reg.$$.json && mv /tmp/reg.$$.json registry.json
```

### Worker Self-Identification

Init message now includes UUID:
```
"You are Fred (UUID: fred-20251209-143027-x7k2, Pane: %18).
Update title: ./iris/set-worker-title.sh fred-20251209-143027-x7k2 "task"
When done: ./iris/worker-done.sh fred-20251209-143027-x7k2 "summary"
Your task: ..."
```

Worker scripts now take UUID as primary identifier, not pane ID.

### Session Notes Updates

Notes reference UUID for unambiguous linking:
```markdown
**Worker:** fred-20251209-143027-x7k2
```

This allows lookup in registry.history to see exactly which worker wrote the note.

## Helper Scripts

### iris/worker-lookup.sh
```bash
#!/bin/bash
# Find worker by name
# Usage: worker-lookup.sh <name> [--all]
# Returns UUID of matching active worker, or error if ambiguous

NAME="${1,,}"  # lowercase
SHOW_ALL="${2:-}"

REGISTRY="$HOME/Think/iris/sessions/registry.json"

if [ "$SHOW_ALL" = "--all" ]; then
    # Show all matches including history
    jq -r --arg name "$NAME" '
      (.active | to_entries | map(select(.value.name | ascii_downcase == $name))) as $active |
      (.history | map(select(.name | ascii_downcase == $name))) as $hist |
      "Active:\n" + ($active | map("  \(.value.uuid) - \(.value.task)") | join("\n")) +
      "\nHistory:\n" + ($hist | map("  \(.uuid) - \(.task)") | join("\n"))
    ' "$REGISTRY"
else
    # Active only
    MATCHES=$(jq -r --arg name "$NAME" '
      .active | to_entries | map(select(.value.name | ascii_downcase == $name)) | length
    ' "$REGISTRY")

    if [ "$MATCHES" -eq 1 ]; then
        jq -r --arg name "$NAME" '
          .active | to_entries | map(select(.value.name | ascii_downcase == $name))[0].key
        ' "$REGISTRY"
    elif [ "$MATCHES" -eq 0 ]; then
        echo "No active worker named '$NAME'" >&2
        exit 1
    else
        echo "Multiple active workers named '$NAME':" >&2
        jq -r --arg name "$NAME" '
          .active | to_entries | map(select(.value.name | ascii_downcase == $name)) |
          map("  \(.value.uuid) - \(.value.task)") | join("\n")
        ' "$REGISTRY" >&2
        exit 1
    fi
fi
```

### iris/list-workers.sh
```bash
#!/bin/bash
# List all active workers
jq -r '.active | to_entries | map("\(.value.name) (\(.key)): \(.value.status) - \(.value.task)") | join("\n")' \
    "$HOME/Think/iris/sessions/registry.json"
```

## Migration Path

1. **Phase 1**: Add registry.json, have new-worker.sh write to both registry and old files
2. **Phase 2**: Update all scripts to read from registry first, fall back to old files
3. **Phase 3**: Remove old worker-{name}.json writes, keep reads for historical compat
4. **Phase 4**: Full transition, archive/delete old format

## Benefits

| Issue | Old System | New System |
|-------|------------|------------|
| Pane ID reuse | Confusion | UUID is permanent, pane ID is just cached |
| Name recycling | "Which Fred?" | UUID distinguishes fred-143027 from fred-180500 |
| Stale files | Ghost workers | `active` vs `history` is explicit |
| No lifecycle | "What happened?" | Full spawn→update→done/killed tracking |
| Note linkage | "worker-red" | "fred-20251209-143027-x7k2" is unambiguous |

## Edge Cases

**Q: What if tmux session crashes and all panes die?**
A: On Iris startup, validate registry.active against actual tmux panes. Move orphans to history with `outcome: "lost"`.

**Q: What if registry.json gets corrupted?**
A: Keep atomic writes (write to temp, mv). Consider periodic backups to `registry.json.bak`.

**Q: Worker spawns but Claude never starts?**
A: Status remains "starting" - after timeout (5 min?), cleanup process moves to history with `outcome: "failed"`.

## Context for Future Workers

The key insight: **identity should be immutable and permanent**. Pane IDs and names are mutable references that can point to different things over time. UUIDs are forever.

Think of it like:
- Name ("Fred") = nickname, can be shared
- Pane ID ("%18") = desk location, can be reassigned
- UUID ("fred-20251209-143027-x7k2") = SSN, unique forever

When in doubt, use UUID.
