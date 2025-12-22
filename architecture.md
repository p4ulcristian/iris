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

**Gods** are Claude instances summoned in separate tmux panes. Each god is named from the Greek pantheon (Zeus, Apollo, Artemis, Athena, Hermes, Hades, Poseidon, Hera, Ares, Hephaestus, Aphrodite, Dionysus, Demeter) and does the actual work.

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
├── brain/                 # Modular voice and orchestration system
│   ├── tmux/              # STANDALONE: Generic tmux operations
│   │   └── __init__.py    # session, pane, layout (portable, reusable)
│   │
│   ├── cli/               # Iris-specific CLI (uses brain.tmux)
│   │   ├── __init__.py    # Main CLI entry point
│   │   ├── config.py      # Configuration loading
│   │   ├── gods.py        # God management
│   │   ├── tmux.py        # Iris tmux wrapper (god-aware)
│   │   └── servers.py     # Server start/stop
│   │
│   ├── hear/              # STANDALONE: STT server (port 8766)
│   │   ├── __init__.py    # HearClient API
│   │   ├── server.py      # Flask HTTP server
│   │   ├── stt.py         # Parakeet transcription
│   │   └── audio.py       # Microphone capture
│   │
│   ├── speak/             # STANDALONE: TTS server (port 8765)
│   │   ├── __init__.py    # SpeakClient API
│   │   ├── server.py      # Flask HTTP server
│   │   ├── tts.py         # Speech synthesis
│   │   └── audio.py       # Audio playback
│   │
│   ├── wake/              # STANDALONE: Input listener (Linux evdev)
│   │   ├── __init__.py    # PTTListener (platform-aware)
│   │   ├── listener.py    # Main coordinator
│   │   └── ptt.py         # Push-to-talk (Linux)
│   │
│   ├── express/           # STANDALONE: Visual UI (port 8767)
│   │   ├── __init__.py    # ExpressClient API
│   │   ├── server.py      # Flask HTTP server
│   │   └── bubble.py      # GTK4 overlay
│   │
│   ├── skills/            # Pane utilities
│   │   ├── glow/          # Markdown viewer pane
│   │   ├── nvim/          # Neovim editor pane
│   │   └── focus/         # Pane title updates
│   │
│   └── say.py             # Quick TTS utility
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

## Standalone Modules

Each brain module can be used independently:

```python
# tmux - Generic tmux operations
from brain import tmux
tmux.create_session("my-app", window_name="main", command="htop")
tmux.create_pane("my-app", "tail -f log.txt")
tmux.apply_grid_layout("my-app")

# hear - Speech-to-text client
from brain.hear import HearClient
client = HearClient()
client.start()
text = client.stop()

# speak - Text-to-speech client
from brain.speak import SpeakClient, say
say("Hello world", voice="emma")

# wake - Push-to-talk (Linux only)
from brain.wake import PTTListener, is_supported
if is_supported():
    listener = PTTListener(on_press=..., on_release=...)
    listener.start()

# express - Visual UI state
from brain.express import ExpressClient
client = ExpressClient()
client.set_state("listening")
```

## Configuration

`config/settings.json` contains:
- **prompts.iris**: System prompt for Iris
- **prompts.shade**: Template for god prompts (with `{{COLOR_NAME}}`, `{{WORKER_UUID}}`, `{{VOICE}}`, `{{TASK}}` placeholders)
- **colors.themes**: Theme palettes with colors for god panes
- **colors.iris/border/glow**: UI color definitions
- **projects**: Project name to directory mappings
