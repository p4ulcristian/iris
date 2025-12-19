# Iris Architecture

A voice-controlled orchestration system where **Iris** (the messenger of the gods) coordinates **gods** (divine workers) to execute tasks in parallel.

## Core Concepts

```
[User] → [brain/ (STT/TTS)] → [Iris] → [Gods via tmux]
              ↑                            ↓
              └──────── responses ─────────┘
```

**brain/** is Iris's voice system - modular servers for speech-to-text (Parakeet) and text-to-speech (VibeVoice), plus the Python CLI for orchestration.

**Iris** is the orchestrator running in the master tmux pane. She can work directly on simple tasks or delegate larger work to gods.

**Gods** are Claude instances summoned in separate tmux panes. Each god is named from the Greek pantheon (Apollo, Artemis, Athena, Hermes, Hades, Poseidon, Hera, Ares, Hephaestus, Aphrodite, Dionysus, Demeter) and does the actual work.

## tmux Session Structure

```
iris (session)
├── %0 - Iris (master pane, 50% width)
└── Workers (50% right side)
    └── Gods stacked vertically
```

- Master pane stays on the left
- Workers stack on the right (main-vertical layout)
- Each pane has a colored background and title bar showing god name

## File Structure

```
iris/
├── brain/                 # Voice and orchestration system
│   ├── cli/               # Python CLI (iris command)
│   │   ├── __init__.py    # Main CLI entry point
│   │   ├── config.py      # Configuration loading
│   │   ├── gods.py        # God management
│   │   ├── tmux.py        # Tmux operations
│   │   └── servers.py     # Server start/stop
│   ├── skills/            # Specialized pane utilities
│   │   ├── glow/          # Markdown viewer pane
│   │   └── nvim/          # Neovim editor pane
│   ├── say.py             # Speech utility module
│   ├── wake/              # Attention coordinator (CapsLock listener)
│   ├── hear/              # STT server (Parakeet, port 8766)
│   ├── speak/             # TTS server (VibeVoice, port 8765)
│   ├── express/           # Visual UI server (GTK4, port 8767)
│   └── remember/          # Memory and personal notes
├── shadows/               # State for each god
│   ├── <uuid>/            # Per-god folder
│   │   ├── name.txt       # God name (e.g., "Apollo")
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
├── GODS.md                # Instructions for gods
└── CLAUDE.md              # Role detection and shared context
```

## God Lifecycle

1. **Summon**: `iris spawn [--project <name>] "<task>"`
   - Generates UUID: `<name>-YYYYMMDD-HHMMSS-<hex>`
   - Creates `shadows/<uuid>/` with initial state
   - Creates tmux pane with Claude instance
   - Sets pane title: `Name|uuid|project`
   - Starts output logging via `tmux pipe-pane`

2. **Working**: God executes task
   - Status: `laboring`

3. **Completion**: God finishes or encounters issues
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
| `iris spawn "<task>"` | Summon new god |
| `iris spawn --project ir "<task>"` | God with project context |
| `iris list` | List active gods |
| `iris peek <name>` | View god output |
| `iris send <name> "<msg>"` | Send instruction to god |
| `iris kill <name>` | Banish god |
| `iris kill all` | Banish all gods |
| `iris stop` | Stop servers |
| `iris stop all` | Stop everything |

## Skills

Specialized pane utilities that open in the worker grid alongside gods.

### Glow (Markdown Viewer)

Opens markdown files in a pane using [glow](https://github.com/charmbracelet/glow).

```bash
python -m brain.skills.glow <file>
python -m brain.skills.glow IRIS.md
python -m brain.skills.glow /path/to/README.md
```

The pane opens with glow in pager mode (scrollable) and integrates into the grid layout.

### Nvim (Neovim Editor)

Opens files in a pane using neovim. Multiple files open as tabs within a single nvim instance.

```bash
python -m brain.skills.nvim <file> [file2] [file3] ...
python -m brain.skills.nvim IRIS.md
python -m brain.skills.nvim src/main.py src/utils.py src/config.py
```

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
- **prompts.shade**: Template for god prompts (with `{{COLOR_NAME}}`, `{{WORKER_UUID}}`, `{{VOICE}}`, `{{TASK}}` placeholders)
- **colors.themes**: Theme palettes with colors for god panes
- **colors.iris/border/glow**: UI color definitions
- **projects**: Project name to directory mappings
