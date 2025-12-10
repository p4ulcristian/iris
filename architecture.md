# Iris Architecture

A voice-controlled orchestration system where **Iris** (the herald) coordinates **shades** (workers) to execute tasks in parallel.

## Core Concepts

```
[User] → [Voice/Canary STT] → [Iris] → [Shades via tmux]
                                 ↓
                          [Kokoro TTS] ← responses
```

**Iris** is the orchestrator running in the master tmux pane. She delegates tasks to shades but never writes code herself.

**Shades** are Claude instances spawned in separate tmux panes. Each shade is assigned a color name (Ruby, Amber, Sol, Jade, Azure, Indigo, Violet, Coral, Cyan, Magenta, Crimson, Gold) and does the actual work.

## tmux Session Structure

```
iris (session)
├── %0 - Iris (master pane, 35% width)
└── Workers (65% right side)
    ├── Column 1 (up to 4 shades)
    ├── Column 2 (up to 4 shades)
    └── ...
```

- Master pane stays on the left at 35% width
- Workers fill columns on the right (max 4 per column)
- Each pane has a colored background and title bar showing shade name

## File Structure

```
~/Iris/
├── spells/              # Shell scripts for orchestration
│   ├── iris.sh          # Main CLI (spawn, status, kill, send, peek, stop)
│   ├── spawn.sh         # Creates new shade panes
│   ├── report.sh        # Shade-to-Iris messaging
│   ├── messenger.sh     # Delivers queued reports to Iris when idle
│   ├── change-detector.sh  # Tracks pane activity for idle detection
│   ├── pane.sh          # Low-level tmux pane operations
│   ├── layout.sh        # Manages pane sizing
│   ├── title.sh         # Updates shade status/title
│   ├── list.sh          # Lists active/historical shades
│   └── kill.sh          # Terminates shades
├── shadows/             # State for each shade
│   ├── <uuid>/          # Per-shade folder
│   │   ├── name.txt     # Color name (e.g., "Magenta")
│   │   ├── task.txt     # Original assigned task
│   │   ├── current_task.txt  # Current activity
│   │   ├── status.txt   # laboring|dormant|fulfilled|scattered
│   │   ├── spawned.txt  # Timestamp
│   │   ├── project.txt  # Associated project (if any)
│   │   └── output.log   # Full pane output (via tmux pipe-pane)
│   └── notes/           # Session notes for knowledge transfer
├── config/
│   └── settings.json    # Prompts and color definitions
├── IRIS.md              # Instructions for Iris
├── SHADE.md             # Instructions for shades
└── CLAUDE.md            # Role detection and shared context
```

## Messaging System

Shades communicate back to Iris through a queued messaging system:

### Flow

1. **Shade reports**: `./spells/report.sh "message"` appends to `/tmp/iris/queue`
2. **Change detector**: `change-detector.sh` touches `/tmp/iris/pane-activity` on any tmux output
3. **Messenger**: `messenger.sh` polls the queue and delivers messages when Iris has been idle for 5+ seconds
4. **Delivery**: Messages are sent to Iris pane as `# <shade>: <message>`

This prevents interrupting Iris mid-thought while ensuring messages are delivered promptly when she's available.

### Temporary Files

```
/tmp/iris/
├── queue              # Pending messages from shades
├── pane-activity      # Touched on any pane output (mtime = last activity)
├── messenger.pid      # Messenger daemon PID
└── messenger.log      # Delivery log
```

## Shade Lifecycle

1. **Summon**: `iris spawn [--project <name>] "<task>"`
   - Generates UUID: `<color>-YYYYMMDD-HHMMSS-<hex>`
   - Creates `shadows/<uuid>/` with initial state
   - Creates tmux pane with Claude instance
   - Sets pane title: `Name|uuid|project`
   - Starts output logging via `tmux pipe-pane`

2. **Working**: Shade executes task
   - Updates `current_task.txt` via `title.sh`
   - Reports progress via `report.sh`
   - Status: `laboring`

3. **Completion**: Shade finishes or encounters issues
   - Reports completion: `report.sh "Done: summary"`
   - Status changes to `fulfilled`, `dormant`, or `scattered`
   - May save notes to `shadows/notes/` for future reference

4. **Banish**: `iris kill <name>` terminates the pane

## Status Icons

| Status | Icon | Meaning |
|--------|------|---------|
| laboring | `▶` | Working on task |
| dormant | `◉` | Idle, waiting |
| fulfilled | `✦` | Task complete |
| scattered | `⚡` | Crashed/error |

## Key Commands

| Command | Description |
|---------|-------------|
| `iris` | Start Iris session |
| `iris spawn "<task>"` | Create new shade |
| `iris spawn --project ir "<task>"` | Shade with project context |
| `iris status` | List active shades |
| `iris peek <name>` | View shade output |
| `iris send <name> "<msg>"` | Send instruction to shade |
| `iris kill <name>` | Terminate shade |
| `iris kill all` | Terminate all shades |
| `iris stop` | Stop everything |

## Configuration

`config/settings.json` contains:
- **prompts.iris**: System prompt for Iris
- **prompts.shade**: Template for shade prompts (with `{{COLOR_NAME}}`, `{{WORKER_UUID}}`, `{{TASK}}` placeholders)
- **colors.shades**: Color palette for shade panes
- **colors.iris/border/glow**: UI color definitions
