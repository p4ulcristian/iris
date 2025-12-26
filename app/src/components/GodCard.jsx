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

  useEffect(() => {
    if (!containerRef.current) return

    // Pre-calculate dimensions from container before creating terminal
    const rect = containerRef.current.getBoundingClientRect()
    const estimatedRows = Math.floor(rect.height / 17) || 24
    const estimatedCols = Math.floor(rect.width / 8.4) || 80

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace',
      rows: estimatedRows,
      cols: estimatedCols,
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

    const textarea = term.textarea

    // Intercept keyboard shortcuts before xterm handles them
    const handleShortcut = (e) => {
      const key = e.key.toLowerCase()
      const isCtrlShortcut = e.ctrlKey && ['n', 'k', 'f', 'l', 'd', 'r'].includes(key)
      const isAltShortcut = e.altKey && (
        ['n', 'k', ',', '.'].includes(key) ||
        (e.key >= '1' && e.key <= '9')
      )

      if (isCtrlShortcut || isAltShortcut) {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: e.key,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          shiftKey: e.shiftKey,
          bubbles: true
        }))
      }
    }

    if (textarea) {
      textarea.addEventListener('keydown', handleShortcut, true)
    }

    const container = containerRef.current
    container.addEventListener('keydown', handleShortcut, true)

    termRef.current = term
    fitAddonRef.current = fitAddon

    // Fit after first render
    const onFirstRender = term.onRender(() => {
      onFirstRender.dispose()
      try { fitAddon.fit() } catch {}
    })

    // Backup fit after delay
    const fitTimeout = setTimeout(() => {
      try { fitAddon.fit() } catch {}
    }, 500)

    // Send input to PTY
    term.onData((data) => {
      sendWs({ event: 'pty:input', godName, data })
    })

    // Refit on container resize using actual cell dimensions
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return

      try {
        const dims = term._core._renderService?.dimensions
        if (!dims?.css?.cell) return

        const rect = containerRef.current.getBoundingClientRect()
        const newCols = Math.floor(rect.width / dims.css.cell.width)
        const newRows = Math.floor(rect.height / dims.css.cell.height)

        if (newRows > 0 && newCols > 0 && (newRows !== term.rows || newCols !== term.cols)) {
          term.resize(newCols, newRows)
          sendWs({ event: 'pty:resize', godName, cols: newCols, rows: newRows })
        }
      } catch {}
    })
    // Observe the parent (relative div) since it's what flex resizes
    const parentEl = containerRef.current.parentElement
    resizeObserver.observe(parentEl)

    // Also listen for global refit event (fired when god count changes)
    const handleRefit = () => {
      try {
        const dims = term._core._renderService?.dimensions
        if (!dims?.css?.cell) return
        const rect = containerRef.current.getBoundingClientRect()
        const newCols = Math.floor(rect.width / dims.css.cell.width)
        const newRows = Math.floor(rect.height / dims.css.cell.height)
        if (newRows > 0 && newCols > 0 && (newRows !== term.rows || newCols !== term.cols)) {
          term.resize(newCols, newRows)
          sendWs({ event: 'pty:resize', godName, cols: newCols, rows: newRows })
        }
      } catch {}
    }
    window.addEventListener('iris:refit', handleRefit)

    // WebSocket connection
    const ws = new WebSocket('ws://localhost:9999')
    wsRef.current = ws

    ws.onopen = () => {
      setTimeout(() => {
        try { fitAddon.fit() } catch {}
        ws.send(JSON.stringify({ event: 'pty:attach', godName, cols: term.cols, rows: term.rows }))
      }, 100)
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.event === 'pty:output' && msg.godName === godName) {
          term.write(msg.data)
        }
      } catch {}
    }

    function sendWs(data) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data))
      }
    }

    term.focus()

    return () => {
      clearTimeout(fitTimeout)
      onFirstRender.dispose()
      window.removeEventListener('iris:refit', handleRefit)
      if (textarea) {
        textarea.removeEventListener('keydown', handleShortcut, true)
      }
      container.removeEventListener('keydown', handleShortcut, true)
      resizeObserver.disconnect()
      term.dispose()
      ws.close()
    }
  }, [godName, color])

  return (
    <div
      onClick={onFocus}
      className={`flex flex-col h-full min-h-0 bg-bg-primary rounded-lg overflow-hidden border-2 transition-all ${isFocused ? 'ring-2 ring-white/20' : ''}`}
      style={{
        borderColor: color,
        boxShadow: isFocused ? `0 0 30px ${color}44` : `0 0 20px ${color}22`
      }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center h-8 px-3 bg-bg-secondary"
        style={{ borderBottom: `1px solid ${color}44` }}
      >
        <span className="text-sm font-medium" style={{ color }}>{name}</span>
        <div className="flex-1" />

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

      {/* Terminal - absolute positioning gives explicit dimensions */}
      <div className="flex-1 relative min-h-0">
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{ backgroundColor: '#0a0a0a' }}
        />
      </div>
    </div>
  )
}
