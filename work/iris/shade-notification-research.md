# Shade Completion Notification Research

*Research by Violet on how Iris can detect when shades finish tasks*

## Problem Statement

Iris needs to know when a shade:
1. Completes its task (fulfilled)
2. Is waiting for input (idle/dormant)
3. Has encountered an error (scattered)

Currently there's no mechanism for shades to signal back to Iris.

---

## Approach 1: Claude Code Hooks (Recommended)

Claude Code has a built-in hooks system that fires shell commands at specific events.

### Relevant Hook Events

| Event | When It Fires | Use Case |
|-------|---------------|----------|
| `Stop` | Main agent finishes responding | Detect task completion |
| `SubagentStop` | Subagent finishes | Track nested work |
| `SessionStart` | Session begins | Initialize shade status |
| `SessionEnd` | Session terminates | Cleanup, final status |
| `Notification` | Claude sends notification (idle 60s+) | Detect "waiting for input" |

### Configuration

Hooks go in `.claude/settings.json` (project-level) or `~/.claude/settings.json` (user-level):

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/paul/Iris/spells/hooks/shade-stop.sh",
            "timeout": 10
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/paul/Iris/spells/hooks/shade-end.sh"
          }
        ]
      }
    ]
  }
}
```

### Hook Input

Hooks receive JSON via stdin with context:

```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/current/directory",
  "hook_event_name": "Stop"
}
```

### Hook Output

Control behavior via exit codes and JSON stdout:

- Exit 0 + `{"continue": true}` → Normal completion
- Exit 0 + `{"continue": false, "stopReason": "Done"}` → Stop Claude
- Exit 2 → Block the action (for pre-hooks)

### Implementation for Iris

**On shade spawn** (modify `spawn.sh`):
- Pass shade UUID as environment variable
- Claude instance inherits it

**Stop hook** (`spells/hooks/shade-stop.sh`):
```bash
#!/bin/bash
# Read JSON from stdin
INPUT=$(cat)
UUID="${SHADE_UUID:-unknown}"

# Update registry
/home/paul/Iris/spells/registry.sh update "$UUID" status "fulfilled"
/home/paul/Iris/spells/registry.sh update "$UUID" current_task "Done"

# Optional: notify Iris pane
echo '{"continue": true}'
```

**SessionEnd hook** (`spells/hooks/shade-end.sh`):
```bash
#!/bin/bash
UUID="${SHADE_UUID:-unknown}"
/home/paul/Iris/spells/registry.sh update "$UUID" status "ended"
```

### Pros
- Native to Claude Code, officially supported
- Runs automatically without shade cooperation
- Can inspect transcript to determine outcome
- Fires reliably on completion

### Cons
- Hooks run synchronously (timeout enforced)
- Need to pass UUID via environment
- Stop fires after EVERY response, not just task completion

### Critical Insight: Stop vs Task Completion

The `Stop` hook fires after every Claude response, not just when a task is done. To detect actual task completion:

1. **Check transcript** - Hook can read `transcript_path` to see if task was completed
2. **Use shade self-reporting** - Have shades call `registry.sh update` when done
3. **Combine approaches** - Hook sets "idle", shade sets "fulfilled"

---

## Approach 2: MCP Server (More Complex)

Build a custom MCP server that shades call to report status.

### Architecture

```
┌─────────┐     ┌──────────────────┐     ┌─────────┐
│  Iris   │◄────│ Notification MCP │◄────│ Shades  │
│ (polls) │     │     Server       │     │ (call)  │
└─────────┘     └──────────────────┘     └─────────┘
```

### MCP Server Tools

```json
{
  "tools": [
    {
      "name": "notify_task_complete",
      "inputSchema": {
        "properties": {
          "shade_uuid": {"type": "string"},
          "status": {"enum": ["fulfilled", "scattered", "needs_input"]},
          "summary": {"type": "string"}
        }
      }
    },
    {
      "name": "get_pending_tasks",
      "inputSchema": {}
    }
  ]
}
```

### Pros
- Bidirectional communication possible
- Structured tool interface
- Can add complex logic (queuing, priorities)

### Cons
- Requires building and maintaining MCP server
- Each Claude instance needs its own MCP connection (stdio)
- More complex setup than hooks
- Overkill for current use case

---

## Approach 3: File-Based Polling (Simple)

Shades update registry directly, Iris polls periodically.

### Current Implementation

Already partially implemented via `registry.sh`:
- `registry.sh update <uuid> status "fulfilled"`
- Shades call this when done

### What's Missing

1. **Shade awareness** - Shades don't know their UUID
2. **Self-reporting** - No instruction for shades to report completion
3. **Iris polling** - No mechanism for Iris to watch for changes

### Implementation

**1. Pass UUID to shades** (already done in spawn.sh):
```bash
INIT_MSG="You are $COLOR_NAME. Your UUID is $WORKER_UUID..."
```

**2. Add completion instruction to SHADE.md**:
```markdown
## When You're Done
When your task is complete, update your status:
\`\`\`bash
./spells/registry.sh update YOUR_UUID status "fulfilled"
./spells/registry.sh update YOUR_UUID current_task "Done"
\`\`\`
```

**3. Iris polling loop** (new script or in existing flow):
```bash
# Check for completed shades
while true; do
  FULFILLED=$(jq -r '.active | to_entries[] | select(.value.status == "fulfilled") | .key' "$REGISTRY")
  for uuid in $FULFILLED; do
    # Notify Iris, auto-banish, etc.
  done
  sleep 5
done
```

### Pros
- Simple, uses existing infrastructure
- No new dependencies
- Easy to debug (just JSON files)

### Cons
- Polling delay (not instant notification)
- Relies on shade cooperation
- No notification if shade crashes before updating

---

## Approach 4: tmux Monitoring (Low-Level)

Watch tmux pane activity directly.

### How It Works

```bash
# Check if pane is active (has recent output)
tmux capture-pane -t "$PANE_ID" -p | tail -1

# Wait for pane to become idle
tmux wait-for -S "$PANE_ID-idle"
```

### Detecting "Waiting for Input"

Claude Code shows a prompt when waiting:
```
>
```

Script could watch for this pattern:
```bash
OUTPUT=$(tmux capture-pane -t "$PANE_ID" -p | tail -5)
if echo "$OUTPUT" | grep -q "^> $"; then
  # Shade is waiting for input
fi
```

### Pros
- Works without shade cooperation
- Can detect crashes (pane exits)
- No hooks or MCP needed

### Cons
- Fragile (depends on Claude Code output format)
- Polling-based (not event-driven)
- Can't distinguish "thinking" from "waiting"

---

## Recommendation: Hybrid Approach

Combine hooks with file-based status for reliability:

### Phase 1: Immediate (File-Based)
1. Update SHADE.md with completion instructions
2. Shades call `registry.sh update` when done
3. Iris uses `./spells/iris.sh status` to check

### Phase 2: Hooks Integration
1. Create `.claude/settings.json` with Stop hook
2. Hook updates registry automatically
3. Even if shade forgets, hook catches completion

### Phase 3: Optional Enhancements
1. Add tmux monitoring for crash detection
2. Consider MCP if bidirectional communication needed
3. Desktop notifications via hook

---

## Configuration Files Needed

### `.claude/settings.json` (in Iris vault)

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/paul/Iris/spells/hooks/on-stop.sh"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/paul/Iris/spells/hooks/on-end.sh"
          }
        ]
      }
    ]
  }
}
```

### `spells/hooks/on-stop.sh`

```bash
#!/bin/bash
set -e

# Read hook input
INPUT=$(cat)
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path // empty')

# Get UUID from environment (set by spawn.sh)
UUID="${SHADE_UUID:-}"
if [ -z "$UUID" ]; then
  exit 0  # Not a shade, ignore
fi

# Check transcript for completion signals
if [ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ]; then
  # Look for completion markers in transcript
  if tail -20 "$TRANSCRIPT" | grep -qi "task.*complete\|fulfilled\|done"; then
    /home/paul/Iris/spells/registry.sh update "$UUID" status "fulfilled"
  fi
fi

echo '{"continue": true}'
```

### Environment Variable in spawn.sh

```bash
# Export UUID for hooks
export SHADE_UUID="$WORKER_UUID"
CLAUDE_CMD="cd ~/Iris && SHADE_UUID='$WORKER_UUID' claude --dangerously-skip-permissions ..."
```

---

## Summary

| Approach | Complexity | Reliability | Latency | Best For |
|----------|------------|-------------|---------|----------|
| Hooks | Medium | High | Instant | Primary solution |
| MCP | High | High | Instant | Complex orchestration |
| File Polling | Low | Medium | 2-5s | Fallback/simple |
| tmux Watch | Low | Low | 1-2s | Crash detection |

**Recommended path**: Start with hooks (Phase 2) since they're native to Claude Code and fire reliably. Add file-based fallback for robustness.
