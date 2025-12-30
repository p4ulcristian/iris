# Staggered Startup Animations

## Problem

When Iris starts up, everything populates at once:
- All tabs appear simultaneously
- All entity cards animate together
- All services status updates flood in
- The Surface/tiles render in one burst

This creates a laggy, overwhelming experience.

## Current Flow

1. WebSocket connects
2. Server sends `state:sync` with ALL state at once
3. `syncState()` in store replaces everything atomically
4. React re-renders all components simultaneously
5. framer-motion animates everything at the same time

## Solution: Staged Reveal

Animate the UI in **layers**, creating a cascade effect:

### Stage 1: Shell (0ms)
- App container fades in
- Wallpaper blobs appear
- Left Wing skeleton (just the IRIS branding)

### Stage 2: Structure (100ms delay)
- Left Wing realm tabs stagger in (one by one, 50ms apart)
- Services indicator appears
- Right sidebar skeleton

### Stage 3: Surface (200ms delay)
- Main stage area fades in
- Empty state or tiles appear

### Stage 4: Entities (300ms delay)
- Entity cards stagger in (one by one, 80ms apart)
- Each card has its own entry animation (already exists)
- Terminals connect and attach after their card is visible

### Stage 5: Polish (500ms delay)
- Summon buttons slide in
- Any final UI pieces

## Implementation Approach

### Option A: Delayed Store Sync (Simplest)

Add a `staggeredLoad` mode in the store:

```javascript
// In syncState:
const doSync = async () => {
  // Stage 1: Basic structure
  state.tabs = serverState.tabs
  state.activeTabId = serverState.activeTabId

  await delay(100)

  // Stage 2: Entities (one by one)
  for (const entity of serverState.entities) {
    state.entities[entity.id] = entity
    await delay(80)
  }
}
```

**Pros:** Minimal code changes
**Cons:** Awkward async in store, janky mid-sync state

### Option B: Staged State Flag (Recommended)

Add `loadStage` state that components check:

```javascript
// Store
loadStage: 0, // 0=loading, 1=shell, 2=structure, 3=surface, 4=entities, 5=ready

// On mount
useEffect(() => {
  setLoadStage(1)
  setTimeout(() => setLoadStage(2), 100)
  setTimeout(() => setLoadStage(3), 200)
  setTimeout(() => setLoadStage(4), 300)
  setTimeout(() => setLoadStage(5), 500)
}, [])

// In components
const loadStage = useStore(s => s.loadStage)
if (loadStage < 2) return null // Don't render yet
```

**Pros:** Clean, predictable, no race conditions
**Cons:** Components need to check stage

### Option C: Stagger Index in AnimatePresence (Most Visual)

Pass stagger index to components, let framer-motion handle delays:

```jsx
{activeEntities.map((entity, idx) => (
  <EntityCard
    key={entity.id}
    entity={entity}
    staggerIndex={idx}
    // Each card delays its own animation
  />
))}

// In EntityCard:
initial={{ opacity: 0, y: -40 }}
animate={{ opacity: 1, y: 0 }}
transition={{
  delay: initialLoadDone ? 0 : staggerIndex * 0.08
}}
```

**Pros:** Leverages existing animation system
**Cons:** Only handles one layer, not full staged reveal

## Recommended: Hybrid B + C

1. Use **Option B** for major UI sections (shell → structure → content)
2. Use **Option C** for staggering items within each section (tabs, entity cards)

## Files to Modify

1. **`app/src/store/index.js`**
   - Add `loadStage` state (0-5)
   - Add `setLoadStage` action
   - Possibly add `isStaggeredLoading` flag

2. **`app/src/App.jsx`**
   - On `state:sync`, trigger staged reveal
   - Pass `staggerIndex` to entity maps
   - Conditionally render sections based on `loadStage`

3. **`app/src/components/LeftWing.jsx`**
   - Stagger tab buttons with delay per index
   - Services dropdown delays slightly more

4. **`app/src/components/EntityCard.jsx`**
   - Accept `staggerIndex` prop
   - Add delay to `initial` animation on first load

5. **`app/src/components/EntityGroup.jsx`**
   - Pass stagger indices through to cards

6. **`app/src/components/Surface.jsx`**
   - Delay tile rendering until stage 3+

## Animation Timing Spec

| Element | Start | Duration | Stagger |
|---------|-------|----------|---------|
| App container | 0ms | 200ms | - |
| Left Wing shell | 0ms | 150ms | - |
| Realm tabs | 100ms | 150ms | 50ms/item |
| Services dot | 200ms | 100ms | - |
| Surface area | 200ms | 200ms | - |
| Entity cards | 300ms | 200ms | 80ms/item |
| Summon buttons | 500ms | 150ms | - |

## Edge Cases

- **Hot reload**: Skip stagger, render immediately
- **Tab switch**: No stagger needed (already loaded)
- **New entity spawn**: Individual animation only
- **Reconnect after disconnect**: Maybe shorter stagger?

## Test Plan

1. Full app restart - should see cascade
2. Browser refresh - same cascade
3. Summon new god - single card animation
4. Switch tabs - instant, no stagger
5. Open dev tools - no re-stagger
