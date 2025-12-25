# Iris Brain - Modular Architecture

The brain is Iris's modular voice and orchestration system, with clean separation of concerns.

## Architecture

```
brain/
├── cli/      - Python CLI for orchestration (spawn, kill, list, send, peek)
├── say.py    - Speech utility module
├── wake/     - Attention coordinator (CapsLock listener)
├── hear/     - STT server (Parakeet, port 8766)
├── speak/    - TTS server (VibeVoice, port 8765)
├── express/  - Visual UI server (GTK4 bubble, port 8767)
└── remember/ - Memory and context storage
```

## Components

### wake/ - Attention Coordinator

Listens for CapsLock press/release and coordinates the other servers.

- Uses evdev to monitor keyboard (no grab, so typing still works)
- CapsLock alone = paste transcribed text at cursor
- Shift+CapsLock = send transcribed text to focused tmux pane
- CapsLock+Enter = send Enter to focused tmux pane

Coordinates via HTTP:
- Tells `speak/` to stop on CapsLock press
- Tells `hear/` to start recording on press
- Tells `hear/` to stop and get transcription on release
- Updates `express/` visual state

### hear/ - STT Server

Pure speech-to-text server using Parakeet TDT.

**Port:** 8766

**Endpoints:**
- `GET /health` - Health check
- `POST /start` - Start recording
- `POST /stop` - Stop recording and return transcription
- `POST /transcribe` - Upload audio file for transcription

**Files:**
- `server.py` - Flask HTTP server
- `stt.py` - Parakeet model wrapper
- `audio.py` - Audio recording (sounddevice)

### speak/ - TTS Server

Text-to-speech server using VibeVoice.

**Port:** 8765

**Endpoints:**
- `GET /health` - Health check
- `POST /speak` - Speak text with optional voice selection
- `POST /stop` - Stop playback
- `GET /voices` - List available voices

**Files:**
- `server.py` - Flask HTTP server
- `tts.py` - VibeVoice model wrapper
- `audio.py` - Audio playback (streaming)

### express/ - Visual UI Server

GTK4 bubble overlay showing system state.

**Port:** 8767

**Endpoints:**
- `GET /health` - Health check
- `POST /state` - Update visual state (listening/speaking/loading/ready)

**Files:**
- `server.py` - Flask HTTP server
- `bubble.py` - GTK4 + layer-shell UI

### remember/ - Memory

Personal notes and context:
- `daily/` - Shopping lists, daily notes
- `recipes/` - Recipes
- `3d-printer/` - 3D printer notes

### cli/ - Python CLI

The `iris` command is implemented in Python (`brain/cli/`):
- `__init__.py` - Main CLI entry point and argument parsing
- `config.py` - Configuration loading
- `gods.py` - God management (spawn, kill, list, send, peek)
- `tmux.py` - Tmux session and pane operations
- `servers.py` - Server start/stop management

### say.py - Speech Utility

Simple module for speaking text:
```bash
python -m brain.say "Hello"
python -m brain.say "Bonjour" --voice french
python -m brain.say --greet  # Time-aware greeting
```

## Setup

### Create Virtual Environment

```bash
cd /path/to/iris
python -m venv brain/.venv
source brain/.venv/bin/activate
```

### Install Dependencies

```bash
# For hear/ (STT)
pip install flask nemo_toolkit[asr] sounddevice soundfile numpy

# For speak/ (TTS - VibeVoice)
pip install flask torch transformers sounddevice

# For wake/ (coordinator)
pip install evdev requests

# For express/ (UI)
pip install flask PyGObject
# GTK4 and gtk4-layer-shell installed via system package manager
```

### System Dependencies

```bash
# Arch Linux
sudo pacman -S gtk4 gtk4-layer-shell python-gobject wtype

# Ubuntu/Debian
sudo apt install libgtk-4-1 gtk4-layer-shell libgirepository1.0-dev wtype
```

## Usage

### Start All Components

```bash
iris
```

This starts:
- CLI tmux session
- hear server (STT)
- speak server (TTS)
- express server (visual UI)
- wake coordinator (CapsLock listener)

### Start Specific Components

```bash
iris hear         # Just STT server
iris speak        # Just TTS server
iris express      # Just visual UI
iris wake         # Just wake coordinator
iris hear speak   # Multiple components
```

### Stop Components

```bash
iris stop         # Stop servers only
iris stop all     # Stop everything including CLI
iris stop hear    # Stop specific server
```

### View Logs

```bash
iris logs         # Tail all server logs
iris logs hear    # Tail specific log
```

### God Management

```bash
iris spawn "task description"
iris kill <god-name>
iris send <god-name> "message"
iris peek <god-name>
iris list
```

## Server Communication

All servers communicate via HTTP on localhost:

| Server | Port |
|--------|------|
| speak (TTS) | 8765 |
| hear (STT) | 8766 |
| express (UI) | 8767 |

PID files and logs: `/tmp/iris/*.pid`, `/tmp/iris/*.log`

## Voice Pipeline

1. User presses CapsLock
2. `wake/` detects keypress via evdev
3. `wake/` POSTs to `speak/stop` (interrupt any TTS)
4. `wake/` POSTs to `express/state` (show "listening")
5. `wake/` POSTs to `hear/start` (begin recording)
6. User speaks...
7. User releases CapsLock
8. `wake/` POSTs to `hear/stop` (stop recording, get text)
9. `wake/` receives transcribed text
10. `wake/` pastes text (via wtype) or sends to Iris tmux
11. `wake/` POSTs to `express/state` (show "ready")

## Development

### Running Servers Individually

```bash
# Activate venv
source brain/.venv/bin/activate

# Start a server directly
python brain/hear/server.py
python brain/speak/server.py
python brain/express/server.py
python -m brain.wake.listener
```

### Testing

```bash
# Test speak server
curl -X POST http://127.0.0.1:8765/speak \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world", "voice": "default"}'

# Test hear server health
curl http://127.0.0.1:8766/health

# Test express server state
curl -X POST http://127.0.0.1:8767/state \
  -H "Content-Type: application/json" \
  -d '{"state": "listening"}'
```

## Migration History

The old `echo/` monolith and `spells/` shell scripts have been replaced with this modular architecture:

| Old | New |
|-----|-----|
| `echo/echo/server.py` | Split into `wake/`, `hear/`, `speak/`, `express/` |
| `echo/echo/stt.py` | `hear/stt.py` |
| `echo/echo/audio.py` | `hear/audio.py` |
| `echo/echo/ptt.py` | `wake/ptt.py` |
| `echo/echo/output.py` | `wake/output.py` |
| `echo/echo/bubble.py` | `express/bubble.py` (simplified) |
| `spells/*.sh` | `brain/cli/` (Python) |
| `memory/` | `remember/` |

## Future Enhancements

- [ ] Add wake word detection to `wake/`
- [ ] Expand `express/` bubble UI with controls
- [ ] Add worker (god) status dots to `express/`
- [ ] Implement inter-god messaging via `remember/`
- [ ] Add conversation history to `remember/`
