# Iris Modular Architecture Plan

**Status: IMPLEMENTED**

## Current Shortcuts Overview

### Tmux Hotkeys (config/tmux.conf)

| Shortcut | Action | Iris-Specific? |
|----------|--------|----------------|
| **PANES** |||
| `Ctrl+f` | Toggle fullscreen | No - generic tmux |
| `Ctrl+l` | Rotate layouts | No - generic tmux |
| `Ctrl+n` | Summon god (spawn-picker.sh) | **YES** - Iris gods system |
| `Ctrl+k` | Kill current pane | No - generic (enhanced behavior) |
| `Ctrl+r` | New terminal in iris folder | Partial - hardcoded path |
| `Alt+l` | List gods (`iris list`) | **YES** - Iris CLI |
| `Alt+k` | Kill current window | No - generic tmux |
| **WINDOWS** |||
| `Alt+n` | New window (realm-name.sh) | **YES** - Iris naming |
| `Alt+1-9` | Focus window | No - generic tmux |
| `Alt+,/.` | Prev/next window | No - generic tmux |
| `Alt+w` | Rename window | No - generic tmux |
| `Alt+Shift+1-9` | Move pane to window | No - generic tmux |
| `Alt+Shift+n` | Move pane to new window | No - generic tmux |
| **UI** |||
| `Ctrl+t` | Theme picker | Partial - Iris themes |
| `Ctrl+s` | Skills list | **YES** - Iris skills |
| `Ctrl+h` | Hotkeys help | Partial - shows Iris hotkeys |
| **PREFIX** |||
| `Prefix+S` | Summon god (prompt) | **YES** - Iris CLI |
| **MOUSE** |||
| Right-click tab | Kill window | No - generic |
| Middle-click border | Force kill pane | No - generic |
| Double-click border | Force kill pane | No - generic |
| Click [+] | New window (realm-name) | **YES** - Iris naming |

---

## Current Module Structure

```
brain/
├── cli/               # Iris CLI and orchestration
│   ├── __init__.py    # CLI entry (iris command)
│   ├── config.py      # Configuration loading
│   ├── gods.py        # God spawning/management
│   ├── tmux.py        # Tmux operations
│   ├── servers.py     # Server start/stop
│   └── theme.py       # Theme management
│   └── *.sh           # Shell scripts for popups
│
├── hear/              # Speech-to-Text (STT)
│   ├── server.py      # HTTP server (port 8766)
│   ├── stt.py         # Transcription logic
│   └── audio.py       # Audio capture
│
├── speak/             # Text-to-Speech (TTS)
│   ├── server.py      # HTTP server (port 8765)
│   ├── tts.py         # Speech synthesis
│   ├── tts_vibevoice.py # Chatterbox Turbo integration
│   └── audio.py       # Audio playback
│
├── wake/              # Wake word & PTT
│   ├── listener.py    # Main evdev listener
│   ├── ptt.py         # Push-to-talk handler
│   ├── detector.py    # Wake word detection
│   └── output.py      # Output handler
│
├── express/           # Visual UI (GTK4)
│   ├── server.py      # HTTP server (port 8767)
│   └── bubble.py      # Speech bubble overlay
│
├── skills/            # Pane utilities
│   ├── focus/         # Pane title updates
│   ├── glow/          # Markdown viewer
│   ├── nvim/          # Neovim editor
│   ├── nvim-highlight/# Code highlighting
│   ├── run/           # Command runner
│   ├── chrome/        # Browser control
│   └── linear/        # Linear integration
│
└── say.py             # Quick TTS utility
```

---

## Proposed Modular Split

### 1. `brain-tmux` - Terminal Multiplexer Layer

**Portable**: Yes (any tmux-based workflow)

**Components:**
- Generic tmux configuration (colors, layouts, mouse)
- Window/pane management hotkeys
- Status bar styling
- Base keybindings (Ctrl+f, Ctrl+l, Alt+1-9, etc.)

**Config would expose:**
```toml
[tmux]
status_position = "bottom"
base_index = 1
mouse = true
prefix = "C-b"
```

---

### 2. `brain-hear` - Speech-to-Text Module

**Portable**: Yes (standalone STT server)

**Components:**
- `server.py` - HTTP API for STT
- `stt.py` - Parakeet model inference
- `audio.py` - Microphone capture

**Dependencies:**
- `sounddevice`
- `whisper` / `parakeet-tdt-0.6b` model
- `numpy`

**API:**
```
POST /start   # Begin recording
POST /stop    # Stop and return transcription
GET  /status  # Check if recording
```

**Portable to:** Any system needing voice-to-text

---

### 3. `brain-speak` - Text-to-Speech Module

**Portable**: Yes (standalone TTS server)

**Components:**
- `server.py` - HTTP API for TTS
- `tts.py` - Speech synthesis (Chatterbox Turbo)
- `audio.py` - Audio playback

**API:**
```
POST /speak   # Text to speak
POST /stop    # Interrupt current speech
POST /skip    # Skip to next utterance
GET  /status  # Check if speaking
```

**Portable to:** Any system needing text-to-speech

---

### 4. `brain-wake` - Attention System

**Portable**: Partial (Linux-specific evdev)

**Components:**
- `listener.py` - evdev keyboard monitoring
- `ptt.py` - Push-to-talk coordination
- `detector.py` - Wake word detection (optional)

**Limitations:**
- Uses Linux `evdev` for key capture
- macOS would need different implementation
- Windows would need yet another approach

**Abstraction:**
```python
class InputHandler(ABC):
    @abstractmethod
    def on_key_press(self, key): pass
    @abstractmethod
    def on_key_release(self, key): pass
```

---

### 5. `brain-express` - Visual UI

**Portable**: Partial (GTK4-specific)

**Components:**
- `server.py` - HTTP control API
- `bubble.py` - GTK4 overlay bubble

**Limitations:**
- GTK4 requires GNOME/Wayland
- Could abstract to use Qt, Electron, or web UI

---

### 6. `brain-gods` - Claude Orchestration (Iris-Specific)

**Portable**: No (core Iris functionality)

**Components:**
- `gods.py` - God lifecycle management
- `tmux.py` - Pane creation with Claude
- `shadows/` - State management

**Would stay Iris-specific:**
- God naming (Greek pantheon)
- Task binding
- Status tracking (laboring/dormant/fulfilled/scattered)

---

### 7. `brain-skills` - Pane Utilities

**Portable**: Partial (tmux-dependent)

**Components by portability:**

| Skill | Portable? | Notes |
|-------|-----------|-------|
| `focus` | Yes | Just title updates |
| `glow` | Yes | Markdown rendering |
| `nvim` | Yes | Editor integration |
| `nvim-highlight` | Yes | Code highlighting |
| `run` | Yes | Command execution |
| `chrome` | Yes | Browser control |
| `linear` | Yes | API integration |

---

## Portability Analysis

### What works anywhere (with tmux):

1. **Generic tmux config** - layouts, styling, mouse
2. **Window/pane navigation** - Alt+1-9, etc.
3. **STT server** - standalone speech recognition
4. **TTS server** - standalone speech synthesis
5. **Skills** - most are tmux-agnostic

### What needs abstraction:

1. **Input handling** - evdev is Linux-only
2. **Visual UI** - GTK4 is desktop-specific
3. **Hardcoded paths** - `/home/p4ulcristian/Work/iris`

### What stays Iris-specific:

1. **Gods system** - core orchestration
2. **Iris CLI** - spawn, list, kill
3. **Themes** - god colors
4. **Realm naming** - window mythology

---

## Proposed Package Structure

```
iris/
├── brain/
│   ├── core/          # Iris-specific orchestration
│   │   ├── gods.py
│   │   ├── cli.py
│   │   └── themes.py
│   │
│   ├── tmux/          # Portable tmux layer
│   │   ├── config.py
│   │   ├── pane.py
│   │   └── hotkeys.py
│   │
│   ├── hear/          # Portable STT
│   │   └── (unchanged)
│   │
│   ├── speak/         # Portable TTS
│   │   └── (unchanged)
│   │
│   ├── wake/          # Input abstraction
│   │   ├── base.py    # Abstract interface
│   │   ├── linux.py   # evdev implementation
│   │   └── macos.py   # (future)
│   │
│   ├── express/       # UI abstraction
│   │   ├── base.py    # Abstract interface
│   │   ├── gtk.py     # GTK4 implementation
│   │   └── web.py     # (future web UI)
│   │
│   └── skills/        # Pane utilities
│       └── (unchanged)
│
├── config/
│   ├── tmux/
│   │   ├── base.conf      # Generic tmux
│   │   └── iris.conf      # Iris-specific
│   └── settings.json
```

---

## Migration Steps

### Phase 1: Config Separation
1. Split `tmux.conf` into `base.conf` + `iris.conf`
2. Make paths configurable (not hardcoded)
3. Document generic vs Iris-specific hotkeys

### Phase 2: Module Extraction
1. Make `hear/` a standalone package
2. Make `speak/` a standalone package
3. Add `requirements.txt` per module

### Phase 3: Platform Abstraction
1. Create abstract `InputHandler` for wake
2. Create abstract `UIProvider` for express
3. Implement platform-specific backends

### Phase 4: Documentation
1. Per-module README
2. API documentation
3. Cross-platform setup guides

---

## Hotkey Portability Summary

### Fully Portable (any tmux):
- `Ctrl+f` - Fullscreen toggle
- `Ctrl+l` - Layout rotation
- `Ctrl+k` - Kill pane
- `Alt+1-9` - Window focus
- `Alt+,/.` - Window navigation
- `Alt+w` - Rename window
- `Alt+Shift+1-9` - Move pane

### Iris-Specific (requires Iris):
- `Ctrl+n` - Summon god
- `Alt+l` - List gods
- `Alt+n` - New realm
- `Ctrl+s` - Skills
- `Prefix+S` - Summon prompt

### Partial (needs path changes):
- `Ctrl+r` - New terminal (hardcoded path)
- `Ctrl+t` - Theme picker (Iris themes)
- `Ctrl+h` - Help (Iris hotkeys)
