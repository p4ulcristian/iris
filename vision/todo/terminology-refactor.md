# Terminology Refactor Plan

## New Terminology

| Old Term | New Term | Description |
|----------|----------|-------------|
| Pane | **Tile** | Divided section on a surface |
| GodTaskCard | **Scroll** | Status card in right wing |
| PaneGroup | **ScrollGroup** | Grouped scrolls for stacked tiles |
| StatusBar | **LeftWing** | Left sidebar (realms + powers) |
| (right sidebar) | **RightWing** | Right sidebar (scrolls + summon menu) |
| Services | **Powers** | speak, hear, wake, express |
| (quick menu) | **SummonMenu** | Bottom right creation buttons |
| SplitLayout | **Surface** | Workspace layout on stage |
| (main area) | **Stage** | Main content area |
| Realm/Tab | **Realm** | Keep as-is |
| Entity | **Entity** | Keep as-is |

---

## Files to Rename

### Components

| Current | New |
|---------|-----|
| `Pane.jsx` | `Tile.jsx` |
| `PaneGroup.jsx` | `ScrollGroup.jsx` |
| `GodTaskCard.jsx` | `Scroll.jsx` |
| `StatusBar.jsx` | `LeftWing.jsx` |
| `SplitLayout.jsx` | `Surface.jsx` |

### Server

| Current | New |
|---------|-----|
| `layout.js` | `surface.js` (or keep as layout) |

---

## Code Changes by File

### 1. Component Renames

#### `Pane.jsx` → `Tile.jsx`
- Rename file
- Rename component `Pane` → `Tile`
- Update all internal references to "pane" → "tile"
- CSS classes: `.pane` → `.tile`

#### `PaneGroup.jsx` → `ScrollGroup.jsx`
- Rename file
- Rename component
- Update references

#### `GodTaskCard.jsx` → `Scroll.jsx`
- Rename file
- Rename component `GodTaskCard` → `Scroll`
- CSS classes: `.god-task-card` → `.scroll`

#### `StatusBar.jsx` → `LeftWing.jsx`
- Rename file
- Rename component
- CSS classes: `.status-bar` → `.left-wing`

#### `SplitLayout.jsx` → `Surface.jsx`
- Rename file
- Rename component
- The layout tree renders the surface

---

### 2. State Changes

#### `app/server/state.js`
- `focusedPane` → `focusedTile`
- `services` → `powers`

#### `app/server/handlers.js`
- All `pane` references → `tile`
- All `service` references → `power`
- Event names: `pane:*` → `tile:*`, `service:*` → `power:*`

#### `app/server/layout.js`
- Function names:
  - `createPane()` → `createTile()`
  - `getFirstPane()` → `getFirstTile()`
  - `findPaneByEntity()` → `findTileByEntity()`
  - `addEntityToPane()` → `addEntityToTile()`
  - `removeEntityFromPane()` → `removeEntityFromTile()`
  - `collapseEmptyPanes()` → `collapseEmptyTiles()`
- Type references: `type: 'pane'` → `type: 'tile'`

#### `app/src/store/index.js`
- `focusedPane` → `focusedTile`
- `services` → `powers`
- Action names update

---

### 3. Import Updates

#### `App.jsx`
```javascript
// Old
import StatusBar from './components/StatusBar'
import SplitLayout from './components/SplitLayout'

// New
import LeftWing from './components/LeftWing'
import Surface from './components/Surface'
```

#### All files importing renamed components
- Update import paths
- Update JSX usage

---

### 4. WebSocket Events

| Old Event | New Event |
|-----------|-----------|
| `pane:focus` | `tile:focus` |
| `pane:split` | `tile:split` |
| `pane:collapse` | `tile:collapse` |
| `service:start` | `power:start` |
| `service:stop` | `power:stop` |
| `services:status` | `powers:status` |

---

### 5. CSS Updates

#### Global styles
- `.pane` → `.tile`
- `.pane-group` → `.scroll-group`
- `.god-task-card` → `.scroll`
- `.status-bar` → `.left-wing`
- `.split-layout` → `.surface`

#### New structure classes
- `.stage` - main content wrapper
- `.left-wing` - left sidebar
- `.right-wing` - right sidebar
- `.summon-menu` - bottom right buttons

---

### 6. Documentation Updates

#### `CLAUDE.md`
- Update terminology table
- Update all references

#### `architecture.md`
- Update diagram
- Update component descriptions
- Update WebSocket protocol table

#### `prompts/*.md`
- Update any pane/service references

---

## Execution Order

### Phase 1: Server-side (no breaking changes yet)
1. [ ] Update `layout.js` - rename functions, keep old names as aliases
2. [ ] Update `state.js` - add new field names, keep old as aliases
3. [ ] Update `handlers.js` - support both old and new event names

### Phase 2: Components
4. [ ] Rename `Pane.jsx` → `Tile.jsx`
5. [ ] Rename `PaneGroup.jsx` → `ScrollGroup.jsx`
6. [ ] Rename `GodTaskCard.jsx` → `Scroll.jsx`
7. [ ] Rename `StatusBar.jsx` → `LeftWing.jsx`
8. [ ] Rename `SplitLayout.jsx` → `Surface.jsx`

### Phase 3: Integration
9. [ ] Update `App.jsx` imports and usage
10. [ ] Update `store/index.js`
11. [ ] Update all component imports

### Phase 4: Events & State
12. [ ] Update WebSocket event names (server)
13. [ ] Update WebSocket event handlers (client)
14. [ ] Remove old aliases

### Phase 5: CSS
15. [ ] Update all CSS class names
16. [ ] Add new structural classes

### Phase 6: Documentation
17. [ ] Update `CLAUDE.md`
18. [ ] Update `architecture.md`
19. [ ] Update prompts

---

## Risk Mitigation

- **Incremental**: Each phase can be committed separately
- **Aliases**: Keep old function/event names as aliases during transition
- **Testing**: Test each phase before moving to next
- **Rollback**: Each commit is independently revertable

---

## Notes

- "Entity" stays as-is - it's generic and correct
- "Realm" stays as-is - already good
- "God" stays for Claude instances specifically
- Main structural terms: Stage > Surface > Tile > Entity
