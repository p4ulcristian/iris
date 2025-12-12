# Brain Refactor Plan

Complete rewrite of Iris voice/orchestration into clean `brain/` architecture.

**Approach:** Commit current state, then clean rewrite. Remove echo/ entirely.

## Target Structure

```
brain/
├── wake/           # Attention triggers (CapsLock, future wake word)
├── hear/           # Pure STT server (Parakeet)
├── speak/          # Pure TTS server (Maya)
├── express/        # Visual UI server (bubble overlay)
├── remember/       # Memory (moved from memory/)
├── do/             # Action scripts (non-tmux)
└── oversee/        # Tmux/terminal orchestration
```

---

## Architecture

### Voice Flow

```
CapsLock pressed
    ↓
wake/ (evdev listener)
    ├── POST speak:8765/stop    → TTS shuts up
    └── POST hear:8766/start    → STT starts recording

CapsLock released
    ↓
wake/
    └── POST hear:8766/stop     → STT stops, transcribes, returns text
        ↓
    paste text at cursor (or send to Iris tmux)
```

### Responsibilities

| Component | Role |
|-----------|------|
| **wake/** | Coordinator. Listens for triggers (CapsLock, wake word). Calls hear/, speak/, express/. |
| **hear/** | Pure STT. Records audio, transcribes. HTTP API only. |
| **speak/** | Pure TTS. Generates speech, plays audio. HTTP API only. |
| **express/** | Visual UI. Shows state (listening, speaking, loading). HTTP API for state updates. |

---

## Phase 0: Commit Current State

Before any changes:
```bash
git add -A
git commit -m "checkpoint: before brain refactor"
```

---

## Phase 1: Folder Structure

### Rename Existing

| From | To |
|------|----|
| waking | wake |
| hearing | hear |
| speaking | speak |
| remembering | remember |
| doing | do |

### Create New

- `brain/oversee/`

---

## Phase 2: speak/ - TTS Server (Dummy First)

Dummy TTS server first. Port 8765. Real TTS implementation later.

### Files

```
speak/
├── __init__.py
├── server.py       # Flask HTTP server
└── run.sh          # Start script
```

### API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | `{"ready": bool}` |
| `/speak` | POST | `{"text": "...", "voice": "..."}` → logs text (dummy) |
| `/stop` | POST | Stop playback (no-op for now) |

### Dummy Implementation

```python
@app.route('/speak', methods=['POST'])
def speak():
    data = request.get_json()
    print(f"[SPEAK] {data.get('text', '')}")
    return jsonify({"status": "ok"})

@app.route('/stop', methods=['POST'])
def stop():
    return jsonify({"status": "ok"})
```

Real TTS (Maya) added later after pipeline works.

### Config

```python
HOST = "127.0.0.1"
PORT = 8765
```

---

## Phase 3: hear/ - STT Server

Pure STT server. Port 8766.

### Files

```
hear/
├── __init__.py
├── server.py       # Flask HTTP server
├── stt.py          # Parakeet STT wrapper
├── audio.py        # AudioRecorder
└── run.sh          # Start script
```

### API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | `{"ready": bool}` |
| `/start` | POST | Start recording |
| `/stop` | POST | Stop recording, return transcription |
| `/transcribe` | POST | Upload audio file, get text |

### From echo/

Rewrite using:
- `stt.py` (Parakeet wrapper)
- `audio.py` (AudioRecorder)

### Config

```python
HOST = "127.0.0.1"
PORT = 8766
STT_MODEL = "nvidia/parakeet-tdt-0.6b-v3"
SAMPLE_RATE = 16000
```

---

## Phase 4: wake/ - Attention Coordinator

Listens for triggers, coordinates hear/, speak/, express/.

### Files

```
wake/
├── __init__.py
├── listener.py     # Main coordinator
├── ptt.py          # CapsLock/evdev handling
├── output.py       # paste_text (wtype)
└── run.sh          # Start script
```

### Triggers

| Trigger | Action |
|---------|--------|
| CapsLock press | Stop speak/, start hear/, tell express/ "listening" |
| CapsLock release | Stop hear/, get text, paste/send, tell express/ "ready" |
| Shift+CapsLock | Same but send to Iris tmux |
| CapsLock+Enter | Push Enter to Iris tmux |
| Wake word (future) | Activate listening mode |

### From echo/

Rewrite using:
- `ptt.py` (evdev listener)
- `output.py` (paste_text)

### Communication

```python
SPEAK_SERVER = "http://127.0.0.1:8765"
HEAR_SERVER = "http://127.0.0.1:8766"
EXPRESS_SERVER = "http://127.0.0.1:8767"

def on_capslock_press(mode):
    requests.post(f"{SPEAK_SERVER}/stop")
    requests.post(f"{EXPRESS_SERVER}/state", json={"state": "listening"})
    requests.post(f"{HEAR_SERVER}/start")

def on_capslock_release(mode):
    resp = requests.post(f"{HEAR_SERVER}/stop")
    text = resp.json()["text"]
    requests.post(f"{EXPRESS_SERVER}/state", json={"state": "ready"})
    if mode == "iris":
        send_to_iris(text)
    else:
        paste_text(text)
```

---

## Phase 5: express/ - Visual UI Server

GTK4 + layer-shell bubble overlay. Receives state updates via HTTP.

### Files

```
express/
├── __init__.py
├── server.py       # Flask HTTP server (state updates)
├── bubble.py       # GTK4 overlay UI
└── run.sh          # Start script
```

### API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | `{"ready": bool}` |
| `/state` | POST | `{"state": "listening|speaking|loading|ready"}` |

### Features

- Bubble overlay (GTK4 + layer-shell)
- State display: listening, speaking, loading, ready
- Volume control
- Mute button
- Position selector (corners/monitors)
- Audio device selector
- Worker dots (shade status)

### No evdev

wake/ owns the evdev listener. express/ just displays what it's told.

### Config

```python
HOST = "127.0.0.1"
PORT = 8767
```

---

## Phase 6: oversee/ - Tmux Orchestration

### Scripts to Move (from spells/)

| Script | Purpose |
|--------|---------|
| `iris.sh` | Main CLI |
| `spawn.sh` | Spawn shade |
| `kill.sh` | Kill shade |
| `pane.sh` | Tmux pane ops |
| `layout.sh` | Grid layout |
| `list.sh` | List shades |
| `send.sh` | Message to pane |
| `revive.sh` | Revive dead shade |
| `glow.sh` | Markdown viewer |
| `run.sh` | Run command in project |

### Path Updates

```bash
# Update in all scripts
SCRIPTS_DIR="$IRIS_DIR/brain/oversee"
DO_DIR="$IRIS_DIR/brain/do"
```

---

## Phase 7: do/ - Action Scripts

### Scripts to Move

| Script | Purpose |
|--------|---------|
| `say.sh` | TTS via speak/ server |
| `color.sh` | Color config helper |

### Update say.sh

```bash
# Point to new speak/ server
SPEAK_SERVER="http://127.0.0.1:8765"
curl -s -X POST "$SPEAK_SERVER/speak" ...
```

---

## Phase 8: remember/ - Memory

Move data from `memory/` into `brain/remember/`.

```
remember/
├── daily/      # Shopping lists, daily notes
├── recipes/    # Recipes
├── 3d-printer/ # 3D printer notes
└── ...         # Other memory content
```

No symlinks. Just move the data.

---

## Phase 9: Cleanup

1. Remove `echo/` entirely
2. Remove `spells/` after oversee/ + do/ verified
3. Update docs (CLAUDE.md, IRIS.md, SHADE.md, architecture.md)
4. Update systemd/startup scripts if any

---

## iris CLI - Unified Control

Single entry point for all Iris operations.

### Start Components

```bash
iris                    # Start all (cli + hear + speak + express + wake)
iris cli                # Start just Claude tmux session
iris hear               # Start just hear server
iris speak              # Start just speak server
iris express            # Start just express server
iris wake               # Start just wake coordinator
iris speak express      # Start multiple components
iris hear speak wake    # Start multiple components
```

### Stop Components

```bash
iris stop               # Stop servers only (hear, speak, express, wake)
iris stop all           # Stop everything including cli
iris stop hear          # Stop just hear
iris stop hear speak    # Stop multiple
```

### Logs

```bash
iris logs               # Tail all server logs (combined)
iris logs hear          # Tail just hear log
iris logs speak express # Tail multiple
```

### Shade Management

```bash
iris spawn <task>       # Spawn a shade
iris spawn --project <name> <task>
iris kill <name|all>    # Kill shade(s)
iris send <name> <msg>  # Send message to shade
iris peek <name>        # View shade output
iris list               # List active shades
```

### Logic

```bash
# Script detects what to do:
# - No args → start all
# - First arg is "stop" → stop components (remaining args, or all servers if none)
# - First arg is command (spawn/kill/send/peek/list) → shade management
# - Otherwise → treat args as component names to start
```

### Components

| Component | Type | Port |
|-----------|------|------|
| cli | tmux session | - |
| hear | server | 8766 |
| speak | server | 8765 |
| express | server | 8767 |
| wake | process | - |

### Implementation

The `iris` script in `brain/oversee/`:
- Starts components as background processes
- PID files in `/tmp/iris/*.pid`
- Log files in `/tmp/iris/*.log`
- Shared venv at `brain/.venv/`
- Shade management delegates to existing scripts

### Files

```
/tmp/iris/
├── hear.pid
├── hear.log
├── speak.pid
├── speak.log
├── express.pid
├── express.log
├── wake.pid
└── wake.log
```

---

## Execution Order

1. **Commit** current state
2. **speak/** - Dummy TTS server (just API, no echo/ code)
3. **hear/** - STT server (rewrite from echo/)
4. **wake/** - Coordinator (evdev, calls others)
5. **express/** - Visual UI server (rewrite bubble.py)
6. **Test** voice pipeline end-to-end
7. **oversee/** - Move tmux scripts
8. **do/** - Move action scripts
9. **remember/** - Move memory/ data
10. **Cleanup** - Remove echo/, spells/, memory/
11. **Docs** - Update everything

---

## Ports

| Service | Port |
|---------|------|
| speak/ (TTS) | 8765 |
| hear/ (STT) | 8766 |
| express/ (UI) | 8767 |

---

## Dependencies

### speak/
```
llama-cpp-python
snac
torch
soundfile
numpy
flask
```

### hear/
```
nemo_toolkit[asr]
sounddevice
soundfile
numpy
flask
```

### wake/
```
evdev
requests
wtype (for paste on Wayland)
```

### express/
```
flask
PyGObject (GTK4)
gtk4-layer-shell
```
