import { useState, useEffect, useCallback, useRef } from 'react'

export function useWebSocket(url) {
  const [connected, setConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState(null)
  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(url)

    ws.onopen = () => {
      console.log('WebSocket connected')
      setConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        setLastMessage(data)
      } catch (e) {
        console.error('Invalid WebSocket message:', e)
      }
    }

    ws.onclose = () => {
      console.log('WebSocket disconnected')
      setConnected(false)
      // Reconnect after 2 seconds
      reconnectTimeoutRef.current = setTimeout(connect, 2000)
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }

    wsRef.current = ws
    // Expose for components that need direct access
    window.__irisWs = ws
  }, [url])

  const send = useCallback((data) => {
    console.log('useWebSocket.send called:', data)
    const state = wsRef.current?.readyState
    console.log('WebSocket readyState:', state, '(OPEN=1)')
    if (state === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
      console.log('Message sent successfully')
      document.title = `SENT: ${data.event}`
    } else {
      console.error('WebSocket not open! State:', state)
      document.title = `FAILED: state=${state}`
    }
  }, [])

  useEffect(() => {
    connect()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [connect])

  return { connected, send, lastMessage }
}
