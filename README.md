# Iris

**Messenger of the Gods**

Iris is a voice assistant that summons the Greek pantheon to do your bidding. She orchestrates divine workers - Zeus, Apollo, Artemis, Athena, and their kin - each god bringing their power to your tasks.

## The Mythology

In Greek mythology, Iris is the goddess of the rainbow and messenger of the gods. She travels between Olympus and the mortal world, carrying divine commands across realms.

Here, Iris serves a similar role. She listens for your voice, interprets your commands, and summons gods from her pantheon to fulfill them. Each god is an autonomous worker with their own pane, their own context, and their own purpose.

## The Pantheon

| God | Domain |
|-----|--------|
| **Zeus** | Supreme authority |
| **Apollo** | Light and knowledge |
| **Artemis** | Swift execution |
| **Athena** | Wisdom and strategy |
| **Hermes** | Speed and messages |
| **Hades** | Deep work |
| **Poseidon** | Vast undertakings |
| **Hera** | Coordination |
| **Ares** | Aggressive tasks |
| **Hephaestus** | Building and crafting |
| **Aphrodite** | Beauty and design |
| **Dionysus** | Creative chaos |
| **Demeter** | Growth and nurturing |

## Commands

```bash
iris                  # Awaken Iris
iris spawn "task"     # Summon a god
iris list             # Survey the pantheon
iris kill <name>      # Banish a god
iris send <name> msg  # Message a god
iris peek <name>      # Observe a god's work
```

## Hotkeys

| Key | Action |
|-----|--------|
| `Ctrl+n` | Summon a new god |
| `Ctrl+k` | Kill current pane |
| `Ctrl+t` | Change theme |
| `Ctrl+h` | Show hotkeys |
| `Alt+l` | List gods |
| `Alt+k` | Banish by name |

## Requirements

### System Tools

| Tool | Package (Arch) | Purpose |
|------|----------------|---------|
| `uv` | `uv` | Python package manager |
| `tmux` | `tmux` | Session management |
| `wtype` | `wtype` | Wayland text input (PTT) |
| `gtk4-layer-shell` | `gtk4-layer-shell` | Wayland overlay (bubble) |

### Optional

| Tool | Purpose |
|------|---------|
| NVIDIA GPU + CUDA | Faster TTS/STT |
| `claude` CLI | Required for spawning gods |

### Python

Python dependencies are handled automatically via `uv` inline script metadata. Each module declares its own deps - no manual installation needed.

## Architecture

Iris is the invisible orchestrator - the CLI and servers that manage everything. Gods are summoned into tmux panes, all equal, arranged in a grid. Each god runs Claude with full autonomy.

For details, see `architecture.md`.
