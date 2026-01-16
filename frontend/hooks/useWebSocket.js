import { useState, useEffect, useCallback, useRef } from 'react'
import { reportError } from '../utils/error-reporter'

// Singleton WebSocket and state - restore from window on HMR
let sharedWs = window.__irisWs || null
let sharedConnected = sharedWs?.readyState === WebSocket.OPEN
const connectionListeners = window.__irisWsConnectionListeners || new Set()
const messageListeners = window.__irisWsMessageListeners || new Set()
const pendingRequests = window.__irisWsPendingRequests || new Map()

// Reconnection state
let reconnectAttempts = window.__irisWsReconnectAttempts || 0
let reconnectTimeout = null
const MAX_RECONNECT_ATTEMPTS = 50
const INITIAL_RECONNECT_DELAY = 500
const MAX_RECONNECT_DELAY = 30000

// Persist to window for HMR survival
window.__irisWsConnectionListeners = connectionListeners
window.__irisWsMessageListeners = messageListeners
window.__irisWsPendingRequests = pendingRequests

// Generate unique request ID
let requestId = 0
function nextRequestId() {
  return `req-${++requestId}-${Date.now()}`
}

// Calculate exponential backoff delay with jitter
function getReconnectDelay() {
  const exponentialDelay = Math.min(
    INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
    MAX_RECONNECT_DELAY
  )
  // Add jitter (±25%) to prevent thundering herd
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1)
  return Math.round(exponentialDelay + jitter)
}

function notifyConnectionChange(isConnected) {
  sharedConnected = isConnected
  connectionListeners.forEach(fn => fn(isConnected))
}

// Shared message handler - handles pending requests then broadcasts to listeners
function handleWsMessage(event) {
  // Check if this is a response to a pending request
  try {
    const data = JSON.parse(event.data)

    if (data.id && pendingRequests.has(data.id)) {
      const { resolve } = pendingRequests.get(data.id)
      pendingRequests.delete(data.id)
      resolve(data)
      return
    }
  } catch (e) {
    // Not JSON or no id - pass to listeners
  }
  messageListeners.forEach(fn => fn(event))
}

function ensureConnection(url) {
  // Clear any pending reconnect
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout)
    reconnectTimeout = null
  }

  // Check for valid existing connection
  if (sharedWs && sharedWs.readyState === WebSocket.OPEN) {
    // Already connected - re-bind message handler in case of HMR
    sharedWs.onmessage = handleWsMessage
    return
  }

  // Clean up stale connection in transitional states
  if (sharedWs && (sharedWs.readyState === WebSocket.CLOSING || sharedWs.readyState === WebSocket.CONNECTING)) {
    // Wait for current connection attempt to settle
    reconnectTimeout = setTimeout(() => ensureConnection(url), 500)
    return
  }

  // Check max attempts
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error(`WebSocket: Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached`)
    reportError({ message: 'WebSocket max reconnect attempts reached' }, 'websocket', { type: 'max_reconnect' })
    return
  }

  console.log(`WebSocket connecting... (attempt ${reconnectAttempts + 1})`)

  const ws = new WebSocket(url)

  ws.onopen = () => {
    console.log('WebSocket connected')
    reconnectAttempts = 0 // Reset on successful connection
    window.__irisWsReconnectAttempts = 0
    notifyConnectionChange(true)
  }

  ws.onclose = (event) => {
    console.log(`WebSocket disconnected (code: ${event.code}, reason: ${event.reason || 'none'})`)
    notifyConnectionChange(false)
    sharedWs = null
    window.__irisWs = null

    // Schedule reconnect with exponential backoff
    reconnectAttempts++
    window.__irisWsReconnectAttempts = reconnectAttempts
    const delay = getReconnectDelay()
    console.log(`WebSocket reconnecting in ${delay}ms (attempt ${reconnectAttempts})`)
    reconnectTimeout = setTimeout(() => ensureConnection(url), delay)
  }

  ws.onerror = (error) => {
    console.error('WebSocket error:', error)
    reportError({ message: 'WebSocket connection error' }, 'websocket', { type: 'connection', attempt: reconnectAttempts })
  }

  ws.onmessage = handleWsMessage

  sharedWs = ws
  window.__irisWs = ws
}

export function useWebSocket(url, { trackMessages = false } = {}) {
  const [connected, setConnected] = useState(sharedConnected)
  const [lastMessage, setLastMessage] = useState(null)

  useEffect(() => {
    // Subscribe to connection changes
    const onConnectionChange = (isConnected) => setConnected(isConnected)
    connectionListeners.add(onConnectionChange)

    // Message handler - only track if opt-in (avoids re-renders during streaming)
    let onMessage = null
    if (trackMessages) {
      onMessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          setLastMessage(data)
        } catch (e) {
          console.error('Invalid WebSocket message:', e)
          reportError(e, 'websocket', { type: 'parse', data: event.data?.slice(0, 200) })
        }
      }
      messageListeners.add(onMessage)
    }

    // Ensure we have a connection
    ensureConnection(url)

    // Sync current state
    setConnected(sharedConnected)

    return () => {
      connectionListeners.delete(onConnectionChange)
      if (onMessage) messageListeners.delete(onMessage)
    }
  }, [url, trackMessages])

  const send = useCallback((data) => {
    if (sharedWs?.readyState === WebSocket.OPEN) {
      sharedWs.send(JSON.stringify(data))
    } else {
      console.error('WebSocket not open!')
    }
  }, [])

  // Request/response pattern - sends message with ID and waits for response
  const request = useCallback((event, data = {}, timeout = 30000) => {
    return new Promise((resolve, reject) => {
      if (!sharedWs || sharedWs.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'))
        return
      }

      const id = nextRequestId()
      const timer = setTimeout(() => {
        pendingRequests.delete(id)
        reject(new Error(`Request timeout: ${event}`))
      }, timeout)

      pendingRequests.set(id, {
        resolve: (data) => {
          clearTimeout(timer)
          resolve(data)
        }
      })

      sharedWs.send(JSON.stringify({ id, event, ...data }))
    })
  }, [])

  return { connected, send, request, lastMessage }
}
