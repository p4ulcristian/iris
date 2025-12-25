# Iris v2 - Implementation Plan

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ELECTRON APP                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  React UI                                             │  │
│  │  - Tab bar with god icons + status                    │  │
│  │  - Cards containing xterm.js terminals                │  │
│  │  - Fullscreen button per card                         │  │
│  │  - Motion animations (spawn, banish, focus)           │  │
│  │  - Dark theme                                         │  │
│  └───────────────────────────────────────────────────────┘  │
│                           │                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  node-pty spawns: tmux attach -t iris-<god>           │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              TMUX SESSIONS (independent)                    │
│                                                             │
│   iris-zeus          iris-apollo         iris-hades         │
│   └── claude         └── claude          └── claude         │
│                                                             │
│   • Survive Electron crash                                  │
│   • Reconnect on restart                                    │
│   • Gods can read each other via capture-pane               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                 WEBSOCKET SERVER (:9999)                    │
│   • Events from CLI/Python                                  │
│   • Voice state (listening/ready)                           │
│   • God status updates                                      │
│   • Broadcast to all clients                                │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack (Latest Versions)

```json
{
  "dependencies": {
    "@xterm/xterm": "^6.0.0",
    "@xterm/addon-fit": "^0.10.0",
    "node-pty": "^1.1.0",
    "motion": "^12.23.26",
    "ws": "^8.18.0",
    "react": "^19.2.3",
    "react-dom": "^19.2.3"
  },
  "devDependencies": {
    "electron": "^39.2.7",
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "tailwindcss": "^4.0.0"
  }
}
```

## File Structure

```
app/
├── package.json
├── vite.config.js
├── tailwind.config.js
├── index.html                 # Vite entry
│
├── main/                      # Electron main process
│   ├── index.js               # App lifecycle, window
│   ├── tmux.js                # Tmux session management
│   ├── pty.js                 # node-pty for xterm
│   └── ws-server.js           # WebSocket server
│
├── src/                       # React renderer
│   ├── main.jsx               # React entry
│   ├── App.jsx                # Root component
│   ├── components/
│   │   ├── GodCard.jsx        # Card with xterm + fullscreen
│   │   ├── GodTabs.jsx        # Tab bar
│   │   ├── Terminal.jsx       # xterm.js wrapper
│   │   └── StatusBar.jsx      # Bottom bar
│   ├── hooks/
│   │   ├── useWebSocket.js    # WS connection
│   │   └── useGods.js         # God state management
│   └── styles/
│       └── index.css          # Tailwind + custom
│
└── preload.js                 # Electron preload
```

## Key Features

### 1. Session Discovery on Start
```javascript
// List existing god sessions
tmux list-sessions -F "#{session_name}" | grep "^iris-"
// For each: create tab, attach xterm
```

### 2. God Lifecycle
| Action | Command |
|--------|---------|
| Spawn | `tmux new-session -d -s iris-zeus "claude 'task'"` |
| Attach | `tmux attach -t iris-zeus` (via node-pty → xterm) |
| Kill | `tmux kill-session -t iris-zeus` |
| List | `tmux list-sessions \| grep iris-` |

### 3. Inter-god Communication
```javascript
// God reads another god
tmux capture-pane -t iris-apollo -p

// God sends to another god
tmux send-keys -t iris-apollo "message" Enter
```

### 4. UI Components

**GodCard.jsx**
- Bordered card with god's color
- xterm.js terminal inside
- Fullscreen toggle button
- Status indicator (▶ ◉ ✦)

**GodTabs.jsx**
- Horizontal tabs with icons
- Click to focus
- Drag to reorder (optional)
- Close button (banish)

**StatusBar.jsx**
- Voice state indicator
- God count
- Settings button

### 5. Animations (Motion)
| Event | Animation |
|-------|-----------|
| God spawn | Card slides in + glow |
| God banish | Card shrinks + fades |
| Tab switch | Crossfade |
| Fullscreen | Expand from card |
| Voice listening | Pulse effect |

## Implementation Phases

### Phase 1: Vite + React Setup
- Initialize Vite with React
- Tailwind CSS
- Basic Electron integration
- Dark theme

### Phase 2: Tmux Integration
- Session management (create/list/kill)
- node-pty spawning `tmux attach`
- Session discovery on startup

### Phase 3: xterm.js
- Terminal component
- PTY connection
- Fit addon for resize

### Phase 4: React UI
- GodCard component
- GodTabs component
- StatusBar component
- Layout (grid/fullscreen)

### Phase 5: WebSocket
- Server in main process
- Client hook in React
- Event handling (voice, status)

### Phase 6: Motion Animations
- Spawn/banish animations
- Tab transitions
- Fullscreen expand
- Glow effects

### Phase 7: Polish
- Keyboard shortcuts
- Settings panel
- Error handling
- Reconnection logic

## Commands

```bash
# Development
cd app && bun install && bun run dev

# Test session discovery
tmux new-session -d -s iris-test "echo 'test god'"
bun run dev  # Should discover iris-test
```
