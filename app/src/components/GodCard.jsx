import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'

export default function GodCard({ god, isActive, onClose }) {
  const containerRef = useRef(null)
  const termRef = useRef(null)
  const fitAddonRef = useRef(null)
  const wsRef = useRef(null)

  const { name, color } = god
  const godName = name

  // Connect to PTY via WebSocket
  useEffect(() => {
    if (!containerRef.current) return

    // Create terminal
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#e0e0e0',
        cursor: color,
        cursorAccent: '#0a0a0a',
        selectionBackground: `${color}40`
      }
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)

    termRef.current = term
    fitAddonRef.current = fitAddon

    // Fit after mount
    requestAnimationFrame(() => {
      fitAddon.fit()
      // Request PTY attachment
      sendWs({ event: 'pty:attach', godName, cols: term.cols, rows: term.rows })
    })

    // Handle user input -> send to PTY
    term.onData((data) => {
      sendWs({ event: 'pty:input', godName, data })
    })

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current && termRef.current) {
        fitAddonRef.current.fit()
        sendWs({ event: 'pty:resize', godName, cols: termRef.current.cols, rows: termRef.current.rows })
      }
    })
    resizeObserver.observe(containerRef.current)

    // Connect to WebSocket for PTY data
    const ws = new WebSocket('ws://localhost:9999')
    wsRef.current = ws

    ws.onopen = () => {
      // Request attachment
      ws.send(JSON.stringify({ event: 'pty:attach', godName, cols: term.cols, rows: term.rows }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.event === 'pty:output' && msg.godName === godName) {
          term.write(msg.data)
        }
      } catch (e) {
        // Might be binary data
      }
    }

    function sendWs(data) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data))
      }
    }

    // Focus terminal
    term.focus()

    return () => {
      resizeObserver.disconnect()
      term.dispose()
      ws.close()
    }
  }, [godName, color])

  return (
    <div
      className={`absolute inset-0 flex flex-col bg-bg-primary transition-opacity duration-150 ${isActive ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}
    >
      {/* Header */}
      <div
        className="flex items-center h-9 px-4 bg-bg-secondary border-b-2"
        style={{
          borderColor: color,
          boxShadow: `0 2px 20px ${color}33`
        }}
      >
        <span className="text-sm font-medium" style={{ color }}>{name}</span>
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center text-text-secondary hover:text-red-500 hover:bg-white/10 rounded transition-all"
          title="Banish"
        >
          ×
        </button>
      </div>

      {/* Terminal */}
      <div ref={containerRef} className="flex-1 overflow-hidden" style={{ minHeight: 0 }} />
    </div>
  )
}
