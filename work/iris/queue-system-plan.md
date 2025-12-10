# Iris Message Queue System

*Decoupled notification system for shade-to-Iris communication*

## Architecture

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐
│ Shades  │────▶│ Queue File  │────▶│   Daemon    │
│ (hooks) │     │ (append)    │     │ (watches)   │
└─────────┘     └─────────────┘     └──────┬──────┘
                                           │
                ┌─────────────┐            │
                │ Iris Idle   │◀───────────┘
                │   Flag      │     (checks before send)
                └──────┬──────┘
                       │
                ┌──────▼──────┐
                │ Iris Pane   │
                │ (receives)  │
                └─────────────┘
```

## Components

### 1. Iris Idle Flag (`/tmp/iris/idle`)

Simple file-based flag:
- File exists = Iris is idle
- File missing = Iris is busy

### 2. Iris Hooks (manages idle flag)

**PreToolUse / UserPromptSubmit** → Set busy (delete flag)
**Stop** → Start 5-second timer, then set idle (create flag)

### 3. Shade Hooks (write to queue)

**Stop** → Append message to queue file

### 4. Queue Daemon (`spells/queue-daemon.sh`)

Background process that:
- Watches for idle flag
- When idle, reads queue and sends to Iris pane
- Clears processed messages

---

## File Locations

```
/tmp/iris/
├── idle              # Flag file (exists = idle)
├── busy-timer.pid    # PID of pending idle timer
└── queue             # Message queue (one per line)
```

---

## Implementation

### Part 1: Iris Hooks

**`.claude/settings.json`** (in Iris vault):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/paul/Iris/spells/hooks/iris-busy.sh"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/paul/Iris/spells/hooks/iris-stop.sh"
          }
        ]
      }
    ]
  }
}
```

**`spells/hooks/iris-busy.sh`**:

```bash
#!/bin/bash
# Iris is busy - cancel idle timer, remove flag

IRIS_DIR="/tmp/iris"

# Kill pending idle timer if exists
if [ -f "$IRIS_DIR/busy-timer.pid" ]; then
  kill "$(cat "$IRIS_DIR/busy-timer.pid")" 2>/dev/null
  rm -f "$IRIS_DIR/busy-timer.pid"
fi

# Remove idle flag
rm -f "$IRIS_DIR/idle"

exit 0
```

**`spells/hooks/iris-stop.sh`**:

```bash
#!/bin/bash
# Iris stopped responding - start 5-sec timer to set idle

IRIS_DIR="/tmp/iris"
mkdir -p "$IRIS_DIR"

# Kill any existing timer
if [ -f "$IRIS_DIR/busy-timer.pid" ]; then
  kill "$(cat "$IRIS_DIR/busy-timer.pid")" 2>/dev/null
fi

# Start background timer
(
  sleep 5
  touch "$IRIS_DIR/idle"
  rm -f "$IRIS_DIR/busy-timer.pid"
) &

echo $! > "$IRIS_DIR/busy-timer.pid"

echo '{"continue": true}'
```

---

### Part 2: Shade Hooks

**Shade `.claude/settings.json`** (or user-level):

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/paul/Iris/spells/hooks/shade-stop.sh"
          }
        ]
      }
    ]
  }
}
```

**`spells/hooks/shade-stop.sh`**:

```bash
#!/bin/bash
# Shade stopped - queue notification for Iris

UUID="${SHADE_UUID:-}"
[ -z "$UUID" ] && exit 0

IRIS_DIR="/tmp/iris"
QUEUE="$IRIS_DIR/queue"
STATE_DIR="$IRIS_DIR/shade-state"
mkdir -p "$IRIS_DIR" "$STATE_DIR"

# Debounce: only queue if 3+ seconds since last stop
NOW=$(date +%s)
LAST=$(cat "$STATE_DIR/$UUID" 2>/dev/null || echo 0)
echo "$NOW" > "$STATE_DIR/$UUID"

[ $((NOW - LAST)) -lt 3 ] && exit 0

# Get shade name
NAME=$(jq -r --arg uuid "$UUID" '.active[$uuid].name // empty' \
  /home/paul/Iris/spells/sessions/registry.json)
[ -z "$NAME" ] && exit 0

# Append to queue (atomic with flock)
(
  flock 200
  echo "$NAME is idle" >> "$QUEUE"
) 200>"$QUEUE.lock"

echo '{"continue": true}'
```

---

### Part 3: Queue Daemon

**`spells/queue-daemon.sh`**:

```bash
#!/bin/bash
# Queue daemon - sends queued messages to Iris when she's idle

IRIS_DIR="/tmp/iris"
QUEUE="$IRIS_DIR/queue"
IDLE_FLAG="$IRIS_DIR/idle"
POLL_INTERVAL=2

mkdir -p "$IRIS_DIR"
touch "$QUEUE"

echo "Queue daemon started (PID $$)"

while true; do
  sleep "$POLL_INTERVAL"

  # Check if Iris is idle
  [ ! -f "$IDLE_FLAG" ] && continue

  # Check if queue has messages
  [ ! -s "$QUEUE" ] && continue

  # Process queue (atomic read + clear)
  (
    flock 200

    # Read all messages
    MESSAGES=$(cat "$QUEUE")

    # Clear queue
    > "$QUEUE"

    # Send each message to Iris pane
    while IFS= read -r msg; do
      [ -z "$msg" ] && continue
      tmux send-keys -t iris:0.0 "# $msg" Enter
      sleep 0.5  # Small delay between messages
    done <<< "$MESSAGES"

  ) 200>"$QUEUE.lock"

done
```

**Start daemon**:

```bash
# In iris.sh cmd_start, after creating session:
nohup "$SPELLS_DIR/queue-daemon.sh" > /tmp/iris/daemon.log 2>&1 &
echo $! > /tmp/iris/daemon.pid
```

**Stop daemon** (in `cmd_stop`):

```bash
if [ -f /tmp/iris/daemon.pid ]; then
  kill "$(cat /tmp/iris/daemon.pid)" 2>/dev/null
  rm -f /tmp/iris/daemon.pid
fi
```

---

### Part 4: Spawn Integration

**Modify `spawn.sh`** to pass UUID to shade:

```bash
# Current:
CLAUDE_CMD="cd ~/Iris && claude --dangerously-skip-permissions -- '$ESCAPED_MSG'"

# Updated:
CLAUDE_CMD="cd ~/Iris && SHADE_UUID='$WORKER_UUID' claude --dangerously-skip-permissions -- '$ESCAPED_MSG'"
```

---

## Message Flow Example

1. **Amber finishes task** → Shade `Stop` hook fires
2. Hook appends `Amber is idle` to `/tmp/iris/queue`
3. Meanwhile, **Iris is talking to Paul** → busy, no idle flag
4. Iris finishes responding → `Stop` hook starts 5-sec timer
5. 5 seconds pass, no new activity → idle flag created
6. **Daemon sees idle flag + queue has messages**
7. Daemon sends `# Amber is idle` to Iris pane
8. Iris receives it as input, can respond or ignore

---

## Edge Cases

### Multiple shades go idle at once
Queue collects all messages, daemon sends them sequentially with 0.5s delay.

### Iris starts typing while daemon is sending
`PreToolUse` hook clears idle flag, but message already sent. Acceptable - Iris sees it as context.

### Daemon crashes
Messages stay in queue, delivered when daemon restarts.

### Shade crashes (no Stop hook)
Won't queue message. Could add tmux pane-exit monitoring as fallback.

---

## Files to Create

| File | Purpose |
|------|---------|
| `spells/hooks/iris-busy.sh` | Clear idle flag when Iris active |
| `spells/hooks/iris-stop.sh` | Start idle timer when Iris stops |
| `spells/hooks/shade-stop.sh` | Queue message when shade stops |
| `spells/queue-daemon.sh` | Background process to deliver messages |
| `.claude/settings.json` | Hook configuration |

---

## Testing

1. Start Iris, verify daemon starts
2. Spawn a shade with simple task
3. Watch `/tmp/iris/queue` for messages
4. Wait for Iris to go idle (5 sec)
5. Verify message appears in Iris pane

```bash
# Monitor in real-time:
watch -n1 'echo "=== IDLE ===" && cat /tmp/iris/idle 2>/dev/null && echo "=== QUEUE ===" && cat /tmp/iris/queue'
```
