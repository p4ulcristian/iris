# Iris

**Messenger of the Gods**

Iris is a voice assistant that summons the Greek pantheon to do your bidding. She orchestrates divine workers - Zeus, Apollo, Artemis, Athena, and their kin - each god bringing their power to your tasks.

## Download

Get the latest release from [GitHub Releases](https://github.com/p4ulcristian/iris/releases).

### Linux

Download the `.AppImage` or `.deb` and run it.

### macOS

1. Download the `.dmg` file
2. Open the DMG and drag Iris to Applications
3. Run in terminal:
   ```bash
   xattr -cr /Applications/Iris.app
   ```
4. Open Iris from Applications

> The `xattr` command removes the quarantine flag since the app isn't code-signed.

## The Mythology

In Greek mythology, Iris is the goddess of the rainbow and messenger of the gods. She travels between Olympus and the mortal world, carrying divine commands across realms.

Here, Iris serves a similar role. She listens for your voice, interprets your commands, and summons gods from her pantheon to fulfill them. Each god is an autonomous Claude instance with their own terminal, context, and purpose.

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

## Quick Start

```bash
cd app
bun install
bun run dev
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+N` | Summon a new god |
| `Ctrl+K` | Banish focused god |
| `Ctrl+F` | Toggle fullscreen |
| `Ctrl+L` | Rotate grid layout |
| `Alt+N` | New tab |
| `Alt+K` | Close tab |
| `Alt+,/.` | Previous/next tab |

## Requirements

### Required

| Tool | Package (Arch) | macOS | Purpose |
|------|----------------|-------|---------|
| `claude` CLI | `npm i -g @anthropic-ai/claude-code` | same | Spawning gods |
| `dtach` | `dtach` | `brew install dtach` | Session persistence |

### Voice Features (Linux only)

| Tool | Package (Arch) | Purpose |
|------|----------------|---------|
| `uv` | `uv` | Python package manager |
| `wtype` | `wtype` | Wayland text input (PTT) |
| `gtk4-layer-shell` | `gtk4-layer-shell` | Speech bubble overlay |

### Optional

| Tool | Purpose |
|------|---------|
| NVIDIA GPU + CUDA | Faster TTS/STT |

### Python

Python dependencies are handled automatically via `uv` inline script metadata. Each module declares its own deps - no manual installation needed.

## Architecture

Iris runs as an Electron app with an embedded WebSocket server. Gods are spawned as dtach sessions (persistent terminal sessions) and rendered via xterm.js. The app discovers existing sessions on startup, so gods survive restarts.

For details, see `architecture.md`.
