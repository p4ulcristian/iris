# Iris Entity System Refactor Plan

## Project Context

**Iris** is a voice-controlled god orchestration system built with Electron + Python + React. It allows users to summon "gods" (Claude AI instances) that run in terminal sessions, along with various utility "entities" like browsers, git viewers, code editors, and tools.

**Entities** are the core building blocks of Iris - they represent anything that can be spawned into a tile: gods, terminals, browsers, settings panels, and custom tools like the RSVP speed reader.

## Problem Statement

Currently, adding a new entity requires touching **7 different files**:

| File | What needs to be added |
|------|------------------------|
| `app/src/entities/config.js` | Entity type, label, icon, color |
| `app/src/entities/EntityIcon.jsx` | FontAwesome icon import + mapping |
| `app/src/components/Tile.jsx` | Switch case mapping type → View component |
| `app/src/components/EntityPickerModal.jsx` | Add to hardcoded picker list |
| `app/src/App.jsx` | Import View component |
| `app/src/App.jsx` | Add DraggableTypeButton to sidebar |
| `app/server/handlers.js` | Add to ENTITY_TYPES object |

This fragmentation makes it difficult to add new entities and will become a maintenance burden as Iris grows.

## Solution: Centralized Entity System

### Core Principle

**Server as single source of truth.** The server loads entity definitions and communicates them to the frontend via WebSocket. Frontend dynamically renders based on what the server provides.

### Architecture

```
┌─────────────────────────────────────────────────┐
│                    SERVER                        │
│  ┌─────────────┐    ┌──────────────────────┐   │
│  │   Entity    │───▶│   Entity Registry    │   │
│  │   Loader    │    │   (single source)    │   │
│  └─────────────┘    └──────────┬───────────┘   │
│                                │               │
└────────────────────────────────┼───────────────┘
                                 │ WebSocket
                                 ▼ registry:sync
┌─────────────────────────────────────────────────┐
│                   FRONTEND                       │
│  ┌──────────────────────────────────────────┐  │
│  │  Receives registry, dynamically loads     │  │
│  │  views, renders sidebar, picker, tiles    │  │
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### New Folder Structure

Each entity lives in its own folder under `app/entities/`:

```
app/
  entities/
    rsvp/
      manifest.json     # Metadata (label, icon, color, category)
      server.js         # Backend event handlers
      View.jsx          # Frontend component

    browser/
      manifest.json
      server.js
      View.jsx

    god/
      manifest.json
      server.js         # PTY/process management
      View.jsx          # TerminalContent wrapper

    terminal/
      manifest.json
      server.js
      View.jsx

    ... (all 17 entities)
```

### manifest.json Format

```json
{
  "type": "rsvp",
  "label": "RSVP",
  "description": "Speed reader",
  "icon": "faBook",
  "color": "#10B981",
  "category": "tools",
  "showInPicker": true,
  "showInSidebar": true
}
```

For image-based icons:
```json
{
  "type": "browser",
  "label": "Browser",
  "description": "Web browser",
  "iconPath": "./icon.svg",
  "color": "#4285F4",
  "category": "tools"
}
```

### Categories

Sidebar organizes entities by category (no more manual row layout):

| Category | Entities |
|----------|----------|
| `process` | god, terminal, nvim |
| `tools` | browser, code, git, rsvp, linear |
| `media` | youtube-music, messenger, discord |
| `system` | settings, cemetery, history, oracle, personalities, calendar |

### server.js Format

Each entity's server.js exports handlers for its events:

```javascript
// entities/browser/server.js
export const type = 'browser'

export function onSpawn(data, context) {
  // Called when entity is spawned
  return {
    url: data.url || 'https://google.com'
  }
}

export function onEvent(event, data, context) {
  // Handle entity-specific events
  switch (event) {
    case 'browser:navigate':
      // Handle navigation
      break
  }
}

export function onDestroy(entityId, context) {
  // Cleanup when entity is destroyed
}
```

### Build Step

- All `View.jsx` files are bundled together at build time
- No runtime bundling - keeps things simple
- Server loads manifests and server.js modules on startup

### WebSocket Protocol

**New event: `registry:sync`**
- Sent from server to client on WebSocket connect
- Contains all entity metadata from manifests
- Frontend stores in state and uses for rendering

```javascript
// Server sends on connect:
{
  event: 'registry:sync',
  entities: {
    rsvp: { type: 'rsvp', label: 'RSVP', icon: 'faBook', ... },
    browser: { type: 'browser', label: 'Browser', ... },
    ...
  }
}
```

**Existing event: `entity:spawn`**
- Stays the same
- Server routes to correct entity's `server.js` onSpawn handler

## Files to Delete

After migration, these become obsolete:

- `app/src/entities/config.js` - replaced by manifests
- `app/src/entities/EntityIcon.jsx` - icon logic moves to dynamic lookup
- Hardcoded switch in `Tile.jsx` - replaced with dynamic component loading
- Hardcoded `DraggableTypeButton` instances in `App.jsx` - data-driven loop
- Hardcoded `PICKER_ENTITY_TYPES` in `EntityPickerModal.jsx` - reads from registry
- `ENTITY_TYPES` object in `server/handlers/` - loaded from entity folders

## Files to Create/Modify

### New Files

1. **`app/server/entityLoader.js`** - Scans entities folder, loads manifests and server modules
2. **`app/entities/index.js`** - Exports all View components for bundling
3. **Entity folders** - One folder per entity with manifest.json, server.js, View.jsx

### Modified Files

1. **`app/server/handlers/`** - Use entity loader instead of hardcoded ENTITY_TYPES
2. **`app/server/state.js`** - Add registry to appState, broadcast on connect
3. **`app/src/store/index.js`** - Add entityRegistry to store
4. **`app/src/App.jsx`** - Data-driven sidebar from registry
5. **`app/src/components/Tile.jsx`** - Dynamic view component lookup
6. **`app/src/components/EntityPickerModal.jsx`** - Read from registry
7. **Build config** - Ensure entity Views are bundled

## Implementation Steps

### Phase 1: Create Entity Loader (Server)

1. Create `app/server/entityLoader.js`
2. Scan `app/entities/*/manifest.json`
3. Load and validate manifests
4. Dynamically import `server.js` modules
5. Build registry object

### Phase 2: WebSocket Registry Sync

1. Add `registry:sync` event
2. Send registry to client on connect
3. Store in frontend state
4. Ensure hot-reload works (re-sync on reconnect)

### Phase 3: Migrate Existing Entities

1. Create folder structure for all 17 entities
2. Move View components into entity folders
3. Extract server handlers into entity server.js files
4. Create manifest.json for each

### Phase 4: Update Frontend

1. Dynamic sidebar rendering from registry
2. Dynamic picker modal from registry
3. Dynamic Tile view loading
4. Remove hardcoded imports and switch statements

### Phase 5: Cleanup

1. Delete obsolete files
2. Update build configuration
3. Test all entities work correctly
4. Document new entity creation process

## Adding a New Entity (After Refactor)

**Step 1:** Create folder `app/entities/myentity/`

**Step 2:** Create `manifest.json`:
```json
{
  "type": "myentity",
  "label": "My Entity",
  "description": "Does something cool",
  "icon": "faWandMagicSparkles",
  "color": "#FF6B6B",
  "category": "tools"
}
```

**Step 3:** Create `server.js`:
```javascript
export const type = 'myentity'
export function onSpawn(data, context) {
  return {}
}
```

**Step 4:** Create `View.jsx`:
```jsx
export default function MyEntityView({ entityId }) {
  return <div>My Entity Content</div>
}
```

**Step 5:** Rebuild and restart. Done!

## Success Criteria

- Adding a new entity requires only creating 3 files in one folder
- No changes needed to App.jsx, Tile.jsx, handlers.js, or any other file
- Sidebar and picker automatically show new entities
- Server automatically handles new entity events
- Existing functionality preserved for all 17 current entities
