# Iris Architecture

A voice-controlled orchestration system where **Iris** (the messenger of the gods) coordinates **gods** (divine workers) to execute tasks in parallel.

## Core Concepts

```
[User] → [brain/ (STT/TTS)] → [Electron App] → [Gods via dtach]
              ↑                                      ↓
              └────────────── responses ─────────────┘
```

**brain/** is the voice system - modular servers for speech-to-text (Parakeet) and text-to-speech (VibeVoice).

**Electron App** is the orchestrator - spawns gods, manages sessions, renders terminals. WebSocket server on port 9999.

**Gods** are Claude instances in dtach sessions, rendered via xterm.js. All gods are equal. Each is named from the Greek pantheon (Zeus, Apollo, Artemis, Athena, Hermes, Hades, Poseidon, Hera, Ares, Hephaestus, Aphrodite, Dionysus, Demeter).

## App Structure

```
┌───────────────────────────────────────────────────────────────┐
│ ┌────────┐ ┌───────────────────────────────┐ ┌──────────────┐ │
│ │        │ │           STAGE               │ │              │ │
│ │  LEFT  │ │ ┌─────────────┬─────────────┐ │ │    RIGHT     │ │
│ │  WING  │ │ │    TILE     │    TILE     │ │ │    WING      │ │
│ │        │ │ │   (Zeus)    │   (Apollo)  │ │ │              │ │
│ │ Realms │ │ │             │             │ │ │   Scrolls    │ │
│ │   +    │ │ └─────────────┴─────────────┘ │ │      +       │ │
│ │ Powers │ │         SURFACE               │ │ Summon Menu  │ │
│ └────────┘ └───────────────────────────────┘ └──────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

- **Stage**: Main content area with the Surface layout
- **Surface**: Splittable workspace containing Tiles
- **Tiles**: Individual sections holding entities (gods, terminals, etc.)
- **Left Wing**: Realm tabs + Powers (services)
- **Right Wing**: Entity Scrolls + Summon menu

## File Structure

```
iris/
├── app/                   # Electron + React app
│   ├── main/
│   │   ├── index.js       # Electron main process, WebSocket server
│   │   └── preload.js     # Context bridge
│   ├── src/
│   │   ├── App.jsx        # Main React component
│   │   ├── components/
│   │   │   ├── Terminal.jsx    # xterm.js wrapper
│   │   │   ├── TileCard.jsx    # Entity container wrapper (in tiles)
│   │   │   ├── Tile.jsx        # Single tile in Surface layout
│   │   │   ├── Surface.jsx     # Recursive layout renderer
│   │   │   ├── EntityCard.jsx  # Entity status card (right wing)
│   │   │   ├── EntityGroup.jsx # Entities grouped by stage
│   │   │   └── LeftWing.jsx    # Left sidebar (Realms + Powers)
│   │   ├── hooks/
│   │   │   └── useWebSocket.js # WS connection
│   │   └── store/
│   │       └── index.js        # Zustand state
│   └── package.json
│
├── brain/                 # Voice and utility modules
│   ├── hear/              # STT server (port 8766)
│   │   ├── server.py      # Flask HTTP server
│   │   └── stt.py         # Parakeet transcription
│   │
│   ├── speak/             # TTS server (port 8765)
│   │   ├── server.py      # Flask HTTP server
│   │   └── tts.py         # Speech synthesis
│   │
│   ├── wake/              # Input listener (Linux evdev)
│   │   ├── listener.py    # Main coordinator
│   │   ├── ptt.py         # Push-to-talk (CapsLock)
│   │   └── detector.py    # Wake word detection
│   │
│   ├── express/           # Visual UI (port 8767)
│   │   ├── server.py      # Flask HTTP server
│   │   └── bubble.py      # GTK4 overlay
│   │
│   ├── skills/            # Utility commands
│   │   ├── focus/         # Entity title updates
│   │   ├── glow/          # Markdown viewer
│   │   └── nvim/          # Neovim integration
│   │
│   └── say.py             # Quick TTS utility
│
├── prompts/               # God instructions
│   ├── god.md             # Core god identity
│   ├── realms.md          # Tile/environment info
│   ├── voice.md           # Speech guidelines
│   ├── skills.md          # Available skills
│   └── pantheon.yaml      # God definitions
│
├── config/
│   └── settings.json      # Audio config, etc.
│
├── memory/                # Paul's notes
│   ├── daily/
│   ├── recipes/
│   └── 3d-printer/
│
└── CLAUDE.md              # Project instructions
```

## God Lifecycle

1. **Summon**: User presses Ctrl+N or clicks [+]
   - Electron spawns dtach session: `dtach -n <socket> -E claude "<prompt>"`
   - Socket stored at `~/.local/share/iris/sockets/<name>.sock`
   - React adds god entity to tile

2. **Attach**: When entity renders
   - node-pty spawns: `dtach -a <socket>`
   - PTY output streams to xterm.js via WebSocket

3. **Working**: God executes task
   - Full terminal interaction via xterm
   - God speaks via `python -m brain.say`

4. **Banish**: User presses Ctrl+K or clicks X
   - PTY detached (session persists)
   - `god:kill` event terminates dtach session
   - Socket file removed

## Session Persistence

Gods use **dtach** for persistence:
- Sessions survive app restarts
- Multiple windows can attach to same god
- Closing app detaches but doesn't kill gods

Socket discovery on startup:
```javascript
// List existing sessions
fs.readdirSync('~/.local/share/iris/sockets/')
  .filter(f => f.endsWith('.sock'))
```

## State Management: Server as Single Source of Truth

**Critical Pattern**: The Electron main process is the single source of truth for all application state. The React frontend is a view layer only.

### Why

- Multiple windows can connect to the same server
- State persists across page reloads
- No sync conflicts between client and server
- Simpler mental model: server owns state, clients render it

### How It Works

```
┌─────────────┐     state:sync      ┌─────────────┐
│   Server    │ ──────────────────→ │   Client    │
│  (Electron) │                     │   (React)   │
│             │ ←────────────────── │             │
│  Owns all   │    user actions     │  Renders    │
│   state     │   (events only)     │   state     │
└─────────────┘                     └─────────────┘
```

### Rules

1. **Server owns state**: tabs, gods, theme, services, settings
2. **Client sends events**: `god:spawn`, `tab:add`, `theme:set` - never state
3. **Server broadcasts state**: After any change, server sends `state:sync` to all clients
4. **Client replaces state**: On `state:sync`, client replaces its entire state (no merging)
5. **No localStorage for synced state**: If it needs to persist or sync, it lives on the server

### State Categories

| Category | Owner | Persisted | Examples |
|----------|-------|-----------|----------|
| **App State** | Server | Yes (JSON file) | tabs, gods, theme, settings |
| **Service State** | Server | No (runtime) | service health, connections |
| **View State** | Client | No | focusedGod, fullscreenGod, modals |

### Adding New State

When adding new persistent/synced state:

1. Add to server state (in `main/index.js`)
2. Include in `state:sync` broadcast
3. Add event handler for mutations (e.g., `theme:set`)
4. Client store receives via `syncState()` - no local mutations
5. Persist to disk if needed (server-side)

### Anti-Patterns

```javascript
// BAD: Client mutates synced state directly
const setTheme = (theme) => set((state) => {
  state.theme = theme
  localStorage.setItem('theme', theme)  // NO!
})

// GOOD: Client sends event, server mutates and syncs
const setTheme = (theme) => {
  send({ event: 'theme:set', theme })  // Server will broadcast state:sync
}
```

## WebSocket Protocol

Port 9999, JSON messages:

| Event | Direction | Data |
|-------|-----------|------|
| `connected` | server→client | `{ gods: [...], services: {...} }` |
| `god:spawn` | client→server | `{ name, task }` |
| `god:spawned` | server→client | `{ name, socketPath, color }` |
| `god:kill` | client→server | `{ godName }` |
| `god:killed` | server→client | `{ godName }` |
| `pty:attach` | client→server | `{ godName, cols, rows }` |
| `pty:input` | client→server | `{ godName, data }` |
| `pty:output` | server→client | `{ godName, data }` |
| `pty:resize` | client→server | `{ godName, cols, rows }` |
| `service:start` | client→server | `{ service }` |
| `service:stop` | client→server | `{ service }` |
| `services:status` | server→client | `{ services: {...} }` |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+N` | Summon new god |
| `Ctrl+K` | Kill focused god |
| `Ctrl+R` | Spawn raw terminal |
| `Ctrl+F` | Toggle fullscreen |
| `Ctrl+L` | Rotate grid layout |
| `Ctrl+D` | Toggle dev panel |
| `Alt+N` | New tab |
| `Alt+K` | Kill current tab |
| `Alt+,/.` | Previous/next tab |
| `Alt+1-9` | Go to tab N |
| `Escape` | Exit fullscreen |

## Voice Pipeline

```
[CapsLock hold]
    ↓
wake/ (evdev listener)
    ├── POST speak:8765/stop    → TTS shuts up
    └── POST hear:8766/start    → STT starts recording

[CapsLock release]
    ↓
wake/
    └── POST hear:8766/stop     → STT stops, transcribes
        ↓
    wtype pastes text at cursor
```

## Powers (Services)

Started/stopped via Left Wing or automatically:

| Service | Port | Script |
|---------|------|--------|
| speak | 8765 | `brain/speak/server.py` |
| hear | 8766 | `brain/hear/server.py` |
| express | 8767 | `brain/express/server.py` |
| wake | - | `brain/wake/listener.py` |

Health checks every 3 seconds via HTTP `/health` endpoint.

## Development

```bash
cd app
bun install
bun run dev        # Vite + Electron
```

Production:
```bash
bun run build      # Vite build + electron-builder
```
