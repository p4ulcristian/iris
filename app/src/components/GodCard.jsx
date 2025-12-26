import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'

export default function GodCard({ god, isFocused, isFullscreen, onFocus, onClose, onToggleFullscreen }) {
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

    // Let app-level shortcuts pass through xterm
    term.attachCustomKeyEventHandler((e) => {
      // Ctrl+N, Ctrl+K, Ctrl+F, Ctrl+L, Ctrl+M, Ctrl+T, Ctrl+R - let these bubble up
      if (e.ctrlKey && ['n', 'k', 'f', 'l', 'm', 't', 'r'].includes(e.key.toLowerCase())) {
        return false // Don't handle in xterm, let it bubble
      }
      // Alt+N, Alt+K, Alt+comma, Alt+period, Alt+1-9
      if (e.altKey && (
        ['n', 'k', ',', '.'].includes(e.key.toLowerCase()) ||
        (e.key >= '1' && e.key <= '9')
      )) {
        return false
      }
      // Escape
      if (e.key === 'Escape') {
        return false
      }
      return true // Handle in xterm
    })

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
      onClick={onFocus}
      className={`flex flex-col bg-bg-primary rounded-lg overflow-hidden border-2 transition-all ${isFocused ? 'ring-2 ring-white/20' : ''}`}
      style={{
        borderColor: color,
        boxShadow: isFocused ? `0 0 30px ${color}44` : `0 0 20px ${color}22`
      }}
    >
      {/* Header */}
      <div
        className="flex items-center h-8 px-3 bg-bg-secondary"
        style={{ borderBottom: `1px solid ${color}44` }}
      >
        <span className="text-sm font-medium" style={{ color }}>{name}</span>
        <div className="flex-1" />

        {/* Fullscreen button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleFullscreen()
          }}
          className="w-5 h-5 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-white/10 rounded transition-all text-xs mr-1"
          title={isFullscreen ? 'Exit fullscreen (Ctrl+F)' : 'Fullscreen (Ctrl+F)'}
        >
          {isFullscreen ? '⊙' : '⤢'}
        </button>

        {/* Close button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="w-5 h-5 flex items-center justify-center text-text-secondary hover:text-red-500 hover:bg-white/10 rounded transition-all text-sm"
          title="Banish (Ctrl+K)"
        >
          ×
        </button>
      </div>

      {/* Terminal */}
      <div ref={containerRef} className="flex-1 overflow-hidden" style={{ minHeight: 0 }} />
    </div>
  )
}
