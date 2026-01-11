# Plan: Add Volume Control to Speak Service

## Summary

Add a volume slider to the Speak service in the left sidebar's ServicesDropdown.

## Current State

- **ServicesDropdown** (`frontend/components/LeftSidebar.jsx:487-577`): Lists services with toggle on/off
- **Speak service** (`powers/speak/server.py`): HTTP server with `/speak`, `/mute`, `/unmute` endpoints
- **Audio playback** (`powers/speak/audio.py` → `player.py`): Uses `paplay` subprocess - no volume control currently

## Implementation

### 1. Backend: Add volume endpoint to speak server

**File:** `powers/speak/server.py`

- Add global `volume` state (0.0-1.0, default 1.0)
- Add `GET /volume` endpoint to get current volume
- Add `POST /volume` endpoint to set volume `{ "volume": 0.8 }`
- Include volume in `/health` response for frontend sync

### 2. Backend: Apply volume in player

**File:** `powers/speak/audio.py`

- Add volume parameter to `AudioPlayer.play()`
- Scale audio samples by volume before playback: `audio = audio * volume`

### 3. Frontend: Add volume slider to ServicesDropdown

**File:** `frontend/components/LeftSidebar.jsx`

In `ServicesDropdown` component:
- Add `speakVolume` state, synced from `services:status` WebSocket message
- For the Speak service row, add a small slider (range input) below or inline
- On slider change, POST to `/volume` endpoint via WebSocket event or direct fetch
- Style: thin horizontal slider, 60-80px wide, subtle styling

### 4. Backend: Wire volume through WebSocket

**File:** `server/services.js`

- Add volume to the health check response parsing for speak service
- Include `speakVolume` in `services:status` broadcast

**File:** `server/handlers/settings.js` (or new handler)

- Add handler for `speak:volume` event to proxy to speak service

## UI Design

```
┌─────────────────────┐
│ ● MCP           ●   │
│ ● Hear          ●   │
│   Chronicle     ●   │
│ ● Speak         ●   │
│   ────○──────       │  ← Volume slider under Speak when active
└─────────────────────┘
```

Slider appears only when Speak service is active.

## Files Changed

1. `powers/speak/server.py` - Add volume endpoints
2. `powers/speak/audio.py` - Apply volume scaling
3. `frontend/components/LeftSidebar.jsx` - Add slider UI
4. `server/services.js` - Include volume in status broadcast
5. `server/handlers/settings.js` - Add volume event handler
