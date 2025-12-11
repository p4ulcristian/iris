# Iris Architecture

A voice-controlled orchestration system where **Iris** (the herald) coordinates **shades** (workers) to execute tasks in parallel.

## Core Concepts

```
[User] → [Echo (STT/TTS)] → [Iris] → [Shades via tmux]
              ↑                          ↓
              └──────── responses ───────┘
```

**Echo** is Iris's voice - her ears and mouth. Lives in `echo/` and handles speech-to-text (Canary) and text-to-speech (Kokoro).

**Iris** is the orchestrator running in the master tmux pane. She can work directly on simple tasks or delegate larger work to shades.

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
├── echo/                # Voice system (STT/TTS)
│   ├── echo.sh          # Start/stop Echo server
│   ├── echo/            # Python package
│   │   ├── server.py    # HTTP API + PTT listener
│   │   ├── bubble.py    # Visual overlay (GTK4)
│   │   └── ...
│   ├── speak.sh         # CLI for TTS
│   └── listen.sh        # CLI for STT
├── spells/              # Shell scripts for orchestration
│   ├── iris.sh          # Main CLI (spawn, status, kill, send, peek, stop)
│   ├── spawn.sh         # Creates new shade panes
│   ├── pane.sh          # Low-level tmux pane create/kill
│   ├── layout.sh        # Restructures panes (break-pane/join-pane)
│   ├── list.sh          # Lists active/historical shades
│   ├── say.sh           # Speak via Echo
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

## Shade Lifecycle

1. **Summon**: `iris spawn [--project <name>] "<task>"`
   - Generates UUID: `<color>-YYYYMMDD-HHMMSS-<hex>`
   - Creates `shadows/<uuid>/` with initial state
   - Creates tmux pane with Claude instance
   - Sets pane title: `Name|uuid|project`
   - Starts output logging via `tmux pipe-pane`

2. **Working**: Shade executes task
   - Status: `laboring`

3. **Completion**: Shade finishes or encounters issues
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
