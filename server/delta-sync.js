/**
 * Delta Sync - Unified state synchronization with delta compression.
 *
 * Instead of multiple broadcast channels (state:sync, god:state, etc.),
 * this module provides a single 32ms interval sync that only sends changes.
 */

import { createLogger } from './logger.js'

const log = createLogger('delta-sync')

// Sync state
let wsClients = null
let syncInterval = null
let lastState = null
let stateGetter = null
let sequence = 0

const SYNC_INTERVAL = 32 // ~30 FPS

/**
 * Simple deep diff - returns only changed values.
 * For arrays: returns full array if anything changed (simpler, good enough for our use case).
 */
function diff(oldObj, newObj) {
  if (oldObj === newObj) return undefined
  if (oldObj === null || newObj === null) return newObj
  if (typeof oldObj !== typeof newObj) return newObj
  if (typeof newObj !== 'object') return newObj

  // Arrays: compare by JSON (simpler than element-by-element)
  if (Array.isArray(newObj)) {
    if (!Array.isArray(oldObj)) return newObj
    // Quick length check
    if (oldObj.length !== newObj.length) return newObj
    // Deep compare (could optimize with hash later)
    for (let i = 0; i < newObj.length; i++) {
      if (JSON.stringify(oldObj[i]) !== JSON.stringify(newObj[i])) {
        return newObj
      }
    }
    return undefined // No change
  }

  // Objects: recurse
  const delta = {}
  let hasChanges = false

  // Check for new/changed keys
  for (const key of Object.keys(newObj)) {
    const d = diff(oldObj[key], newObj[key])
    if (d !== undefined) {
      delta[key] = d
      hasChanges = true
    }
  }

  // Check for removed keys
  for (const key of Object.keys(oldObj)) {
    if (!(key in newObj)) {
      delta[key] = null // null signals deletion
      hasChanges = true
    }
  }

  return hasChanges ? delta : undefined
}

/**
 * Apply delta to state (for client-side use).
 * Exported for frontend.
 */
export function applyDelta(state, delta) {
  if (!state) return delta
  if (!delta) return state

  if (typeof delta !== 'object' || delta === null) return delta
  if (Array.isArray(delta)) return delta

  const result = { ...state }

  for (const [key, value] of Object.entries(delta)) {
    if (value === null) {
      delete result[key]
    } else if (typeof value === 'object' && !Array.isArray(value) && typeof result[key] === 'object' && !Array.isArray(result[key])) {
      result[key] = applyDelta(result[key], value)
    } else {
      result[key] = value
    }
  }

  return result
}

/**
 * Broadcast to all connected clients.
 */
function broadcast(data) {
  if (!wsClients) return

  const msg = JSON.stringify(data)
  let sent = 0

  wsClients.forEach(ws => {
    if (ws.readyState === 1) {
      ws.send(msg)
      sent++
    }
  })

  return sent
}

/**
 * Sync tick - compute delta and broadcast if there are changes.
 */
function syncTick() {
  if (!stateGetter) return

  const currentState = stateGetter()
  sequence++

  if (!lastState) {
    // First sync - send full state
    log.log(`Full sync (seq: ${sequence})`)
    broadcast({
      event: 'state:full',
      state: currentState,
      _seq: sequence,
      _serverTime: Date.now()
    })
    lastState = structuredClone(currentState)
    return
  }

  // Compute delta
  const delta = diff(lastState, currentState)

  if (delta) {
    broadcast({
      event: 'state:delta',
      delta,
      _seq: sequence,
      _serverTime: Date.now()
    })
    lastState = structuredClone(currentState)
  }
  // If no delta, don't send anything
}

/**
 * Start delta sync.
 * @param {Set} clients - WebSocket client set
 * @param {Function} getState - Function that returns the full state
 */
export function startDeltaSync(clients, getState) {
  wsClients = clients
  stateGetter = getState
  lastState = null
  sequence = 0

  if (syncInterval) {
    clearInterval(syncInterval)
  }

  syncInterval = setInterval(syncTick, SYNC_INTERVAL)
  log.log(`Delta sync started (${SYNC_INTERVAL}ms interval)`)
}

/**
 * Stop delta sync.
 */
export function stopDeltaSync() {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
  log.log('Delta sync stopped')
}

/**
 * Force immediate sync (for new client connections).
 * Sends full state to a specific client.
 */
export function sendFullState(ws) {
  if (!stateGetter) return

  const state = stateGetter()
  sequence++

  ws.send(JSON.stringify({
    event: 'state:full',
    state,
    _seq: sequence,
    _serverTime: Date.now()
  }))
}

/**
 * Mark state as dirty (forces next sync to recalculate).
 * Call this when you know state has changed significantly.
 */
export function invalidateState() {
  lastState = null
}
