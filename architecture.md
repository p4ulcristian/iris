# Iris Architecture

A voice-controlled orchestration system where **Iris** (the herald) coordinates **shades** (workers) to execute tasks in parallel.

## Core Concepts

```
[User] → [brain/ (STT/TTS)] → [Iris] → [Shades via tmux]
              ↑                            ↓
              └──────── responses ─────────┘
```

**brain/** is Iris's voice system - modular servers for speech-to-text (Parakeet) and text-to-speech (VibeVoice), plus the Python CLI for orchestration.

**Iris** is the orchestrator running in the master tmux pane. She can work directly on simple tasks or delegate larger work to shades.

**Shades** are Claude instances spawned in separate tmux panes. Each shade is assigned a color name (Ruby, Amber, Sol, Jade, Azure, Indigo, Violet, Coral, Cyan, Magenta, Crimson, Gold) and does the actual work.

## tmux Session Structure

```
iris (session)
├── %0 - Iris (master pane, 50% width)
└── Workers (50% right side)
    └── Shades stacked vertically
```

- Master pane stays on the left
- Workers stack on the right (main-vertical layout)
- Each pane has a colored background and title bar showing shade name

## File Structure

```
iris/
├── brain/                 # Voice and orchestration system
│   ├── cli/               # Python CLI (iris command)
│   │   ├── __init__.py    # Main CLI entry point
│   │   ├── config.py      # Configuration loading
│   │   ├── shades.py      # Shade management
│   │   ├── tmux.py        # Tmux operations
│   │   └── servers.py     # Server start/stop
│   ├── say.py             # Speech utility module
│   ├── wake/              # Attention coordinator (CapsLock listener)
│   ├── hear/              # STT server (Parakeet, port 8766)
│   ├── speak/             # TTS server (VibeVoice, port 8765)
│   ├── express/           # Visual UI server (GTK4, port 8767)
│   └── remember/          # Memory and personal notes
├── shadows/               # State for each shade
│   ├── <uuid>/            # Per-shade folder
│   │   ├── name.txt       # Color name (e.g., "Magenta")
│   │   ├── task.txt       # Original assigned task
│   │   ├── status.txt     # laboring|dormant|fulfilled|scattered
│   │   ├── spawned.txt    # Timestamp
│   │   ├── project.txt    # Associated project (if any)
│   │   └── output.log     # Full pane output (via tmux pipe-pane)
│   └── notes/             # Session notes for knowledge transfer
├── config/
│   └── settings.json      # Prompts, colors, project paths
├── iris                   # CLI entry point (Python script)
├── IRIS.md                # Instructions for Iris
├── SHADE.md               # Instructions for shades
└── CLAUDE.md              # Role detection and shared context
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
| `iris` | Start Iris session + all servers |
| `iris spawn "<task>"` | Create new shade |
| `iris spawn --project ir "<task>"` | Shade with project context |
| `iris list` | List active shades |
| `iris peek <name>` | View shade output |
| `iris send <name> "<msg>"` | Send instruction to shade |
| `iris kill <name>` | Terminate shade |
| `iris kill all` | Terminate all shades |
| `iris stop` | Stop servers |
| `iris stop all` | Stop everything |

## Voice Pipeline

```
[CapsLock press]
    ↓
wake/ (evdev listener)
    ├── POST speak:8765/stop    → TTS shuts up
    └── POST hear:8766/start    → STT starts recording

[CapsLock release]
    ↓
wake/
    └── POST hear:8766/stop     → STT stops, transcribes, returns text
        ↓
    paste text at cursor (or send to Iris tmux)
```

## Configuration

`config/settings.json` contains:
- **prompts.iris**: System prompt for Iris
- **prompts.shade**: Template for shade prompts (with `{{COLOR_NAME}}`, `{{WORKER_UUID}}`, `{{VOICE}}`, `{{TASK}}` placeholders)
- **colors.shades**: Color palette for shade panes
- **colors.iris/border/glow**: UI color definitions
- **projects**: Project name to directory mappings
