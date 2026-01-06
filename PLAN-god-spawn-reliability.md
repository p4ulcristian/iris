# Plan: God Spawn Reliability

## Problem Statement

Gods sometimes fail to open in Iris. When spawning fails, users see:
- "Summoning..." forever with no feedback
- Entity card stuck in loading state
- No error messages or recovery options

## Root Cause Analysis

The spawn pipeline has **7 stages** with no error handling between them:

```
1. Frontend → god:spawn WebSocket message
2. Server → createGodSession()
3. Zellij → session creation with KDL layout
4. Frontend → TerminalContent renders
5. Frontend → pty:attach WebSocket message
6. Server → Bun.spawn(['zellij', 'attach'])
7. Continuous → PTY output streaming
```

### Critical Failure Points

| Stage | Failure Mode | Current Behavior | Impact |
|-------|--------------|------------------|--------|
| 2 | `createGodSession()` returns null | Server logs error, nothing else | UI stuck forever |
| 3 | Zellij spawn fails | Silent failure | Empty session or no session |
| 3 | KDL file race condition (50ms sleep) | Layout file deleted before read | Session without Claude |
| 5 | PTY attach before session ready | `sessionExists()` returns false | Error sent but UI doesn't update |
| 5 | Session exists but not active | PTY connects to dead session | No output, stuck UI |
| 6 | Bun.spawn fails | Error logged, nothing else | Terminal shows nothing |

### Race Condition Details

**The 50ms race (gods.js:276):**
```javascript
// File written, then spawned in background
const bgCmd = `(zellij ... --new-session-with-layout "${layoutFile}" ...)`
execSync(bgCmd, { shell: true })

sleepSync(50)  // <-- Too short on slow systems

// File deleted before zellij might have read it
fs.unlinkSync(layoutFile)
```

**PTY attach race (TerminalContent.jsx:269-271):**
```javascript
ws.onopen = () => {
  // Immediately tries to attach - session might not be ready yet
  ws.send(JSON.stringify({ event: 'pty:attach', godName, cols, rows }))
}
```

---

## Implementation Plan

### Phase 1: Quick Fixes (Low Risk)

#### 1.1 Increase KDL file sleep
**File:** `server/gods.js:276`

```javascript
// Before
sleepSync(50)

// After
sleepSync(200)  // Give zellij more time to read layout
```

**Risk:** Low - just a timing change
**Impact:** Fixes most "session without Claude" issues

#### 1.2 Add spawn timeout on frontend
**File:** `src/App.jsx` or `src/store.js`

Add a timeout that transitions `spawning` → `stuck` after 15 seconds:

```javascript
// When spawning starts:
const spawnTimeout = setTimeout(() => {
  if (entity.readyState === 'spawning') {
    updateEntity(entityId, { readyState: 'stuck' })
  }
}, 15000)
```

**Risk:** Low - purely additive
**Impact:** Users see "stuck" instead of eternal spinner

#### 1.3 PTY attach retry logic
**File:** `src/components/TerminalContent.jsx:269`

```javascript
ws.onopen = () => {
  // Try to attach, retry if session not found
  const tryAttach = (attempt = 1) => {
    ws.send(JSON.stringify({ event: 'pty:attach', godName, cols, rows }))
  }

  // Initial attempt after small delay
  setTimeout(() => tryAttach(), 500)
}

// On error, retry
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.event === 'error' && msg.message?.includes('not found') && retryCount < 3) {
    setTimeout(() => tryAttach(retryCount + 1), 1000)
  }
}
```

**Risk:** Low - graceful degradation
**Impact:** Handles race condition between spawn and attach

---

### Phase 2: Proper Error Handling (Medium Risk)

#### 2.1 Session readiness check before PTY attach
**File:** `server/pty.js:76-86`

```javascript
export async function attachPty(godName, ws, cols, rows) {
  const sessionName = getSessionName(godName)

  // Wait for session with timeout
  const maxAttempts = 10
  for (let i = 0; i < maxAttempts; i++) {
    if (sessionExists(godName) && isSessionActive(godName)) {
      break
    }
    await new Promise(r => setTimeout(r, 500))
  }

  if (!isSessionActive(godName)) {
    ws.send(JSON.stringify({
      event: 'god:spawn:failed',
      godName,
      error: 'Session failed to start'
    }))
    return
  }

  // Continue with existing logic...
}
```

**Risk:** Medium - changes async behavior
**Impact:** Proper error propagation to frontend

#### 2.2 Frontend error state handling
**Files:** `src/components/EntityCard.jsx`, `src/store.js`

Add `error` readyState and display:

```jsx
// EntityCard.jsx
{readyState === 'error' && (
  <div className="status-pill error">
    Spawn Failed
    <button onClick={() => retry()}>Retry</button>
  </div>
)}
```

**Risk:** Medium - UI changes
**Impact:** Users can see and recover from failures

#### 2.3 Server-side spawn verification
**File:** `server/handlers.js:98-137`

```javascript
case 'god:spawn': {
  // ... existing spawn logic ...

  const god = createGodSession(godName, data.task, workingDir, options)

  if (!god) {
    ws.send(JSON.stringify({
      event: 'god:spawn:failed',
      godName,
      error: 'Failed to create session'
    }))
    break
  }

  // Verify session actually started
  setTimeout(async () => {
    if (!isSessionActive(godName)) {
      // Clean up and notify
      delete appState.entities[god.name]
      ws.send(JSON.stringify({
        event: 'god:spawn:failed',
        godName,
        error: 'Session exited immediately'
      }))
      broadcastState()
    }
  }, 2000)

  // ... rest of existing logic ...
}
```

**Risk:** Medium - adds async verification
**Impact:** Catches early session death

---

### Phase 3: Robust Architecture (Higher Risk)

#### 3.1 Health check system
**New file:** `server/health.js`

```javascript
const HEALTH_INTERVAL = 10000  // 10 seconds

export function startHealthCheck() {
  setInterval(() => {
    Object.entries(appState.entities).forEach(([id, entity]) => {
      if (entity.type !== 'god' && entity.type !== 'terminal') return

      const isActive = isSessionActive(id)
      const wasActive = entity.readyState !== 'scattered'

      if (wasActive && !isActive) {
        // Session died - update state
        entity.readyState = 'scattered'
        saveState()
        broadcastState()
      }
    })
  }, HEALTH_INTERVAL)
}
```

**Risk:** Higher - continuous background process
**Impact:** Detects zombie gods, updates UI

#### 3.2 Atomic session creation
**File:** `server/gods.js:256-279`

Instead of background spawn + sleep + delete:

```javascript
// Create layout file in a persistent location
const layoutDir = path.join(SOCKET_DIR, 'layouts')
fs.mkdirSync(layoutDir, { recursive: true })
const layoutFile = path.join(layoutDir, `${sessionName}.kdl`)
fs.writeFileSync(layoutFile, layoutContent)

// Spawn synchronously (blocks until session starts)
try {
  execSync(`"${ZELLIJ_BIN}" --config-dir "${ZELLIJ_CONFIG_DIR}" --session "${sessionName}" --new-session-with-layout "${layoutFile}"`, {
    cwd: projectRoot,
    env: zellijEnv,
    stdio: 'ignore',
    timeout: 10000
  })
} finally {
  // Clean up layout file after spawn completes
  try { fs.unlinkSync(layoutFile) } catch {}
}

// Verify session is running
if (!sessionExists(godKey)) {
  throw new Error('Session failed to start')
}
```

**Risk:** Higher - changes spawn mechanism
**Impact:** Eliminates race condition entirely

#### 3.3 WebSocket event for spawn lifecycle
**Files:** `server/handlers.js`, `src/store.js`

New events:
- `god:spawning` - Session creation started
- `god:session:ready` - Zellij session confirmed running
- `god:pty:attached` - PTY successfully connected
- `god:spawn:failed` - Any stage failed with reason

Frontend tracks full lifecycle:

```javascript
// store.js
handleMessage(msg) {
  switch (msg.event) {
    case 'god:spawning':
      updateEntity(msg.godName, { spawnState: 'creating-session' })
      break
    case 'god:session:ready':
      updateEntity(msg.godName, { spawnState: 'attaching-pty' })
      break
    case 'god:pty:attached':
      updateEntity(msg.godName, { spawnState: 'ready', readyState: 'working' })
      break
    case 'god:spawn:failed':
      updateEntity(msg.godName, { spawnState: 'failed', error: msg.error })
      break
  }
}
```

**Risk:** Higher - protocol changes
**Impact:** Full visibility into spawn process

---

## Recommended Implementation Order

1. **Immediate** (can deploy today):
   - 1.1 Increase KDL sleep to 200ms
   - 1.2 Add spawn timeout (15s → stuck)

2. **This week**:
   - 1.3 PTY attach retry logic
   - 2.2 Frontend error state display

3. **Next sprint**:
   - 2.1 Session readiness check
   - 2.3 Server-side spawn verification
   - 3.1 Health check system

4. **When stable**:
   - 3.2 Atomic session creation
   - 3.3 Full lifecycle events

---

## Testing Strategy

### Manual Testing
1. Start fresh - verify god spawns
2. Kill zellij session manually - verify detection
3. Spam spawn button - verify no race conditions
4. Slow network simulation - verify timeouts work
5. Kill Iris during spawn - verify cleanup

### Automated Testing
```bash
# Spawn 10 gods rapidly
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/god/spawn -d '{"name":"zeus"}'
done

# Verify all sessions exist
zellij list-sessions | grep iris-
```

---

## Metrics to Track

After implementation, monitor:
- Spawn success rate (target: >99%)
- Average time to "working" state
- Number of "stuck" states per day
- Health check detections per day

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `server/gods.js` | Sleep timing, atomic spawn |
| `server/pty.js` | Session readiness check |
| `server/handlers.js` | Error events, spawn verification |
| `server/health.js` | New file - health check |
| `src/components/TerminalContent.jsx` | PTY retry logic |
| `src/components/EntityCard.jsx` | Error state display |
| `src/store.js` | Error state handling, lifecycle events |
| `src/App.jsx` | Spawn timeout |
