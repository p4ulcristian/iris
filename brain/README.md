# Iris Brain - Voice Modules

The brain contains Iris's modular voice system - standalone servers for speech-to-text, text-to-speech, and input handling.

## Architecture

```
brain/
├── say.py    - Speech utility module
├── wake/     - Input coordinator (CapsLock listener, wake word)
├── hear/     - STT server (Parakeet, port 8766)
├── speak/    - TTS server (VibeVoice, port 8765)
├── express/  - Visual UI server (GTK4 bubble, port 8767)
├── skills/   - Utility commands (focus, glow, nvim)
└── remember/ - Memory storage
```

## Components

### wake/ - Input Coordinator

Listens for CapsLock press/release and coordinates the other servers.

- Uses evdev to monitor keyboard (no grab, so typing still works)
- CapsLock hold = PTT recording, paste transcribed text at cursor
- Wake word detection ("hey iris") for hands-free activation

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

### speak/ - TTS Server

Text-to-speech server using VibeVoice.

**Port:** 8765

**Endpoints:**
- `GET /health` - Health check
- `POST /speak` - Speak text with optional voice selection
- `POST /stop` - Stop playback
- `GET /voices` - List available voices

### express/ - Visual UI Server

GTK4 bubble overlay showing system state.

**Port:** 8767

**Endpoints:**
- `GET /health` - Health check
- `POST /state` - Update visual state (listening/speaking/loading/ready)

### skills/ - Utility Commands

Commands available to gods:
- `focus` - Update terminal title
- `glow` - View markdown files
- `nvim` - Open files in neovim

### say.py - Speech Utility

Simple module for speaking text:
```bash
python -m brain.say "Hello"
python -m brain.say "Bonjour" --voice french
python -m brain.say --greet  # Time-aware greeting
```

## Server Communication

All servers communicate via HTTP on localhost:

| Server | Port |
|--------|------|
| speak (TTS) | 8765 |
| hear (STT) | 8766 |
| express (UI) | 8767 |

## Voice Pipeline

1. User presses CapsLock (or says "hey iris")
2. `wake/` detects input
3. `wake/` POSTs to `speak/stop` (interrupt any TTS)
4. `wake/` POSTs to `express/state` (show "listening")
5. `wake/` POSTs to `hear/start` (begin recording)
6. User speaks...
7. User releases CapsLock (or VAD detects silence)
8. `wake/` POSTs to `hear/stop` (stop recording, get text)
9. `wake/` receives transcribed text
10. `wake/` pastes text at cursor via wtype
11. `wake/` POSTs to `express/state` (show "ready")

## Running Servers

Services are started/stopped from the Electron app's status bar, or manually:

```bash
# Using uv (recommended)
uv run brain/hear/server.py
uv run brain/speak/server.py
uv run brain/express/server.py
uv run brain/wake/listener.py
```

## Testing

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
