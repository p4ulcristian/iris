import { useState, useEffect, useCallback, useRef } from 'react'
import { reportError } from '../utils/error-reporter'

// Singleton WebSocket and state
let sharedWs = null
let sharedConnected = false
const connectionListeners = new Set()
const messageListeners = new Set()

function notifyConnectionChange(isConnected) {
  sharedConnected = isConnected
  connectionListeners.forEach(fn => fn(isConnected))
}

function ensureConnection(url) {
  if (sharedWs && sharedWs.readyState !== WebSocket.CLOSED) {
    return // Already connected or connecting
  }

  const ws = new WebSocket(url)

  ws.onopen = () => {
    console.log('WebSocket connected')
    notifyConnectionChange(true)
  }

  ws.onclose = () => {
    console.log('WebSocket disconnected')
    notifyConnectionChange(false)
    sharedWs = null
    // Reconnect after 1 second (faster for initial startup race)
    setTimeout(() => ensureConnection(url), 1000)
  }

  ws.onerror = (error) => {
    console.error('WebSocket error:', error)
    reportError({ message: 'WebSocket connection error' }, 'websocket', { type: 'connection' })
  }

  // Attach all registered message listeners to new WebSocket
  ws.onmessage = (event) => {
    messageListeners.forEach(fn => fn(event))
  }

  sharedWs = ws
  window.__irisWs = ws
}

export function useWebSocket(url) {
  const [connected, setConnected] = useState(sharedConnected)
  const [lastMessage, setLastMessage] = useState(null)

  useEffect(() => {
    // Subscribe to connection changes
    const onConnectionChange = (isConnected) => setConnected(isConnected)
    connectionListeners.add(onConnectionChange)

    // Message handler - registered globally so it works across reconnects
    const onMessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        setLastMessage(data)
      } catch (e) {
        console.error('Invalid WebSocket message:', e)
        reportError(e, 'websocket', { type: 'parse', data: event.data?.slice(0, 200) })
      }
    }
    messageListeners.add(onMessage)

    // Ensure we have a connection
    ensureConnection(url)

    // Sync current state
    setConnected(sharedConnected)

    return () => {
      connectionListeners.delete(onConnectionChange)
      messageListeners.delete(onMessage)
    }
  }, [url])

  const send = useCallback((data) => {
    if (sharedWs?.readyState === WebSocket.OPEN) {
      sharedWs.send(JSON.stringify(data))
    } else {
      console.error('WebSocket not open!')
    }
  }, [])

  return { connected, send, lastMessage }
}
