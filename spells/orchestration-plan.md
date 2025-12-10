# Iris Orchestration Plan

## Overview

Master Iris runs in a tmux session, spawns worker panes, coordinates tasks, and speaks all responses. Workers are silent - they write status to JSON files, master reads and reports on demand.

## Architecture

```
                    ┌─────────────────────────────┐
                    │       Iris Bubble (GTK4)    │
                    │  ┌───┐                      │
                    │  │ 👁 │ ← main eye          │
                    │  └───┘                      │
                    │   ●●●  ← worker dots        │
                    └─────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     tmux session: iris                       │
├─────────────────┬─────────────────┬─────────────────────────┤
│ Pane 0: Master  │ Pane 1: Worker  │ Pane 2: Worker          │
│ (speaks)        │ red             │ teal                    │
│ claude --bypass │ claude          │ claude                  │
└─────────────────┴─────────────────┴─────────────────────────┘
                              │
                              ▼
                    ~/Think/iris/sessions/
                    ├── worker-red.json
                    └── worker-teal.json
```

## Hotkey System

Iris uses evdev to intercept keyboard at system level.

| Hotkey | Action |
|--------|--------|
| CapsLock (hold) | Voice → paste at cursor (current behavior) |
| Shift+CapsLock (hold) | Voice → send to master Iris tmux pane |
| Cmd+I | Open/focus Iris tmux session |

### Shift+CapsLock Implementation

Changes to `/home/paul/Work/iris/iris/hotkey.py`:

1. Track Shift key state (KEY_LEFTSHIFT, KEY_RIGHTSHIFT)
2. On CapsLock press, check if Shift is held
3. Pass mode flag to callback: `on_press(mode="paste"|"iris")`

Changes to `/home/paul/Work/iris/iris/server.py`:

1. Modify PTT handler to receive mode
2. If mode is "iris":
   - Transcribe voice as usual
   - Instead of `paste_text()`, run: `tmux send-keys -t iris:master.0 "<text>" Enter`

### Cmd+I Implementation

Hyprland keybind in `~/.config/hypr/hyprland.conf`:

```
bind = SUPER, I, exec, ~/Think/iris/open-iris.sh
```

Script `~/Think/iris/open-iris.sh`:

```bash
#!/bin/bash
# Open or focus Iris tmux session

if ! tmux has-session -t iris 2>/dev/null; then
    # Create new session
    tmux new-session -d -s iris -n master
    tmux send-keys -t iris:master "cd ~/Think && claude --dangerously-skip-permissions" Enter
fi

# Open Ghostty attached to session (or focus existing)
ghostty -e tmux attach -t iris &
```

## Startup Flow (Cmd+I in Omarchy)

1. Check if `iris` tmux session exists
2. If not:
   - Create session: `tmux new-session -d -s iris -n master`
   - Start master: `tmux send-keys "cd ~/Think && claude --dangerously-skip-permissions" Enter`
3. Open Ghostty attached to session
4. Focus master pane

## tmux Config

```bash
# ~/.tmux.conf
set -g mouse on
```

Layouts:
- `main-vertical`: Master big on left, workers stacked right (good for 2-3 workers)
- `tiled`: Grid layout (good for 4+ workers)

Switch with: `tmux select-layout -t iris:master main-vertical`

## Master Iris Responsibilities

- **Voice**: Only master uses `./say.sh` - workers never speak
- **Spawn workers**: `~/Think/iris/spawn-worker.sh [color]`
- **Send tasks**: `~/Think/iris/task-worker.sh <color> <task>`
- **Kill workers**: `~/Think/iris/kill-worker.sh <color>`
- **Monitor status**: Read `iris/sessions/*.json` files on demand
- **Report back**: Speak worker status/results to user when asked

## Worker Behavior

Workers identified by color (red, teal, yellow, mint, etc.)

- **No voice**: Never use `./say.sh`
- **Write status**: Update `~/Think/iris/sessions/worker-<color>.json`
- **Focus on task**: Execute assigned work, report completion via JSON

### Worker Initialization (Prompt Injection)

When master spawns a worker via `spawn-worker.sh`:

```
You are worker red. You are a silent Iris worker.

Rules:
- NEVER use ./say.sh - only master speaks
- Write your status to ~/Think/iris/sessions/worker-red.json
- Update the JSON when you start a task, complete it, or hit an error

Status JSON format:
{"id": "red", "status": "working|idle|done|error", "task": "description", "result": "summary", "updated": "ISO timestamp"}

Confirm you understand by writing an initial idle status to your JSON file.
```

### Worker Status JSON

```json
{
  "id": "red",
  "status": "working|idle|done|error",
  "task": "exploring /home/paul/Work/ironrainbow",
  "result": "summary or error message",
  "updated": "2025-12-09T07:30:00"
}
```

## Bubble UI Enhancements

The existing bubble at `/home/paul/Work/iris/iris/bubble.py` gets:

### Worker Dots

- Small colored circles around the main eye
- One dot per active worker
- Colors from `~/Think/iris/colors.json` palette
- Just dots, no text or snippets (keep it clean)

### Dot States

| Status | Visual |
|--------|--------|
| idle | dim, static |
| working | pulsing glow |
| done | bright, solid |
| error | red, flashing |

### Interactions

- Click dot: focus that tmux pane (future consideration)
- No hover tooltips for v1

### Implementation

1. Add `workers` list to `IrisBubble` class
2. Poll `~/Think/iris/sessions/` for JSON files periodically
3. Render dots in `on_draw` method
4. Color based on status

## Scripts

| Script | Purpose |
|--------|---------|
| `spawn-worker.sh [color]` | Create new worker pane with color ID |
| `task-worker.sh <color> <task>` | Send task to worker |
| `kill-worker.sh <color>` | Kill worker pane and cleanup JSON |
| `open-iris.sh` | Open/focus Iris session (for Cmd+I) |

## Voice Routing

| Action | Target |
|--------|--------|
| CapsLock + voice | Paste at cursor (any app) |
| Shift+CapsLock + voice | Send to master Iris pane |
| Tmux click | Navigate between panes manually |

## File Structure

```
Think/
├── CLAUDE.md              ← master + worker instructions
├── say.sh                 ← TTS script (master only)
├── iris/
│   ├── sessions/          ← worker status JSONs
│   ├── colors.json        ← color palette (16 colors)
│   ├── spawn-worker.sh    ← spawn new worker
│   ├── task-worker.sh     ← send task to worker
│   ├── kill-worker.sh     ← kill worker
│   ├── open-iris.sh       ← open/focus session
│   └── orchestration-plan.md

~/.tmux.conf               ← mouse on
~/.config/hypr/hyprland.conf  ← Cmd+I binding

/home/paul/Work/iris/      ← Iris app (STT/TTS/hotkeys)
├── iris/
│   ├── hotkey.py          ← evdev listener (add Shift detection)
│   ├── server.py          ← main server (add tmux send mode)
│   └── bubble.py          ← overlay (add worker dots)
```

## Implementation Order

1. ✅ Worker scripts (spawn, task, kill)
2. ⬜ open-iris.sh + Hyprland Cmd+I binding
3. ⬜ Shift+CapsLock detection in hotkey.py
4. ⬜ Tmux send mode in server.py
5. ⬜ Worker dots in bubble.py

## Decisions Made

| Question | Decision |
|----------|----------|
| Worker identification | Color names (red, teal, etc.) |
| How does master monitor status? | On-demand (user asks) |
| Focus command needed? | No, use tmux click/keys |
| Bubble shows output? | Just dots, no snippets |
| Voice to master | Shift+CapsLock modifier |
