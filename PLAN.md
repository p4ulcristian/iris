# Plan: JSON Mode Indicator for God Entity Card

## Problem
When a god spawns, it goes through two phases:
1. **Loading JSON config** - Claude Code is reading MCP config, system prompts, etc.
2. **Ready/Working** - Claude is actually processing the task

Currently we only have `spawning` state during the entire startup, with no visibility into when Claude's JSON streaming is being configured vs when it's actually ready.

## Current Flow

```
god:spawn → spawning → (claude process starts) → working
```

The `spawning` state covers:
- Creating the entity
- Spawning the claude process
- Claude loading MCP config (JSON)
- Claude initializing
- Until we get the `init` message

## Proposed States

Add a new ready state `configuring` (or `loading`) that shows when Claude is loading its JSON config:

```
spawning → configuring → working → done/stuck/question
```

## UI Changes

### EntityCard.jsx (Right Sidebar)
Add a new pill status for the `configuring` state:
- Icon: Spinning/loading indicator (faSpinner or faGear)
- Label: "configuring..." or "loading json..."
- Class: `liquid-glass-pill-configuring`

```jsx
case 'configuring': return {
  icon: faGear,
  label: 'configuring...',
  className: 'liquid-glass-pill-configuring'
}
```

### View.jsx (God View Header)
Optionally add a "JSON" badge similar to "Chat"/"Pro" toggle to show Claude is using JSON streaming mode. This is cosmetic/informational.

## Backend Changes

### handlers/god.js
The state transition should be:
1. `spawning` - Initial entity creation, before process starts
2. `configuring` - After process spawns, before `init` message
3. `working` - After `init` received, Claude is processing

```javascript
// Line ~92: Initial state
readyState: 'spawning'

// Line ~117: After spawn but before init
appState.entities[entityId].readyState = 'configuring'

// In gods.js handleClaudeMessage() - after init:
appState.entities[godName].readyState = 'working'
```

### gods.js
In `handleClaudeMessage()` when we receive the `init` message:
- Set `readyState` to `'working'`
- This is when Claude is actually ready to process

## Files to Modify

1. **frontend/components/EntityCard.jsx**
   - Add `configuring` case to `getStatusPill()`
   - Add CSS class for the pill styling

2. **server/handlers/god.js**
   - Change state after spawn to `configuring` instead of `working`

3. **server/gods.js**
   - In `handleClaudeMessage()`, set `readyState` to `working` when `init` is received

4. **frontend/styles/** (if separate CSS)
   - Add `.liquid-glass-pill-configuring` styles

## Optional: JSON Mode Badge on Card

If you want a persistent "JSON" indicator (like Chat/Pro toggle), we could:
- Show on the card when entity uses `stream-json` format
- This would be purely informational since all gods use JSON streaming now

## Summary

| State | When | Indicator |
|-------|------|-----------|
| `spawning` | Entity created, process starting | "summoning..." |
| `configuring` | Process running, loading MCP/prompts | "configuring..." (new) |
| `working` | Init received, Claude processing | (no pill) |
| `done` | Task complete | "done" |
| `stuck` | God stuck | "stuck" |
| `question` | Waiting for user | "question" |
