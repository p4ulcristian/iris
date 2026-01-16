import { useState, useEffect, useRef, useCallback } from 'react'
import { reportError } from '../utils/error-reporter'

/**
 * Apply delta to state.
 * - Objects are merged recursively
 * - Arrays are replaced entirely
 * - null values indicate deletion
 */
function applyDelta(state, delta) {
  if (!state) return delta
  if (!delta) return state

  if (typeof delta !== 'object' || delta === null) return delta
  if (Array.isArray(delta)) return delta

  const result = { ...state }

  for (const [key, value] of Object.entries(delta)) {
    if (value === null) {
      delete result[key]
    } else if (
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key]) &&
      result[key] !== null
    ) {
      result[key] = applyDelta(result[key], value)
    } else {
      result[key] = value
    }
  }

  return result
}

// Singleton state - survives HMR
let sharedState = window.__irisAppState || null
let lastSeq = window.__irisAppStateSeq || 0
const stateListeners = window.__irisAppStateListeners || new Set()

// Persist for HMR
window.__irisAppStateListeners = stateListeners

function notifyStateChange(newState) {
  sharedState = newState
  window.__irisAppState = newState
  stateListeners.forEach(fn => fn(newState))
}

/**
 * Message handler for delta sync messages.
 * Called by useWebSocket's message listeners.
 */
export function handleDeltaSyncMessage(data) {
  // Sequence check - ignore old messages
  if (data._seq && data._seq <= lastSeq) {
    return false
  }
  lastSeq = data._seq || lastSeq
  window.__irisAppStateSeq = lastSeq

  if (data.event === 'state:full') {
    // Full state - replace everything
    notifyStateChange(data.state)
    return true
  }

  if (data.event === 'state:delta') {
    // Delta - merge changes
    if (sharedState) {
      notifyStateChange(applyDelta(sharedState, data.delta))
    }
    return true
  }

  // Legacy support for state:sync (old format)
  if (data.event === 'state:sync') {
    const { event, _receiveTime, ...state } = data
    notifyStateChange(state)
    return true
  }

  return false
}

/**
 * Hook for accessing app state with delta sync.
 *
 * @param {WebSocket message listener adder function} addMessageListener
 * @returns {Object} The current app state
 */
export function useAppState(addMessageListener, removeMessageListener) {
  const [state, setState] = useState(sharedState)

  useEffect(() => {
    // Subscribe to state changes
    const onStateChange = (newState) => setState(newState)
    stateListeners.add(onStateChange)

    // Sync current state
    setState(sharedState)

    // Message handler for WebSocket
    const onMessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        handleDeltaSyncMessage(data)
      } catch (e) {
        // Ignore non-JSON messages
      }
    }

    if (addMessageListener) {
      addMessageListener(onMessage)
    }

    return () => {
      stateListeners.delete(onStateChange)
      if (removeMessageListener) {
        removeMessageListener(onMessage)
      }
    }
  }, [addMessageListener, removeMessageListener])

  return state
}

/**
 * Get current state synchronously (for non-React code).
 */
export function getAppState() {
  return sharedState
}

/**
 * Reset state (for testing/reconnection).
 */
export function resetAppState() {
  sharedState = null
  lastSeq = 0
  window.__irisAppState = null
  window.__irisAppStateSeq = 0
}
