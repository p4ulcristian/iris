import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { getGodPalette } from '../themes/generated/palettes'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowUpRightFromSquare, faExpand, faCompress, faXmark } from '@fortawesome/free-solid-svg-icons'

export default function GodCard({ god, isFocused, isFullscreen, onFocus, onClose, onToggleFullscreen, tabs, activeTabId, onMoveToTab, onMoveToNewTab }) {
  const containerRef = useRef(null)
  const termRef = useRef(null)
  const fitAddonRef = useRef(null)
  const wsRef = useRef(null)
  const [showMoveMenu, setShowMoveMenu] = useState(false)
  const moveMenuRef = useRef(null)

  const { name, color } = god
  const godName = name
  const palette = getGodPalette(name)

  // Close move menu when clicking outside
  useEffect(() => {
    if (!showMoveMenu) return
    const handleClickOutside = (e) => {
      if (moveMenuRef.current && !moveMenuRef.current.contains(e.target)) {
        setShowMoveMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMoveMenu])

  // Get other tabs (tabs we can move to)
  const otherTabs = tabs?.filter(t => t.id !== activeTabId) || []

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
      theme: palette
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
  }, [godName, color, palette])

  return (
    <div
      onClick={onFocus}
      className="relative flex flex-col h-full min-h-0 bg-bg-primary rounded-lg overflow-hidden border-2 transition-all"
      style={{
        borderColor: isFocused ? color : '#333',
        boxShadow: isFocused ? `0 0 30px ${color}44` : 'none'
      }}
    >
      {/* Passive overlay for unfocused panes */}
      {!isFocused && (
        <div className="absolute inset-0 bg-black/40 pointer-events-none z-10 rounded-lg" />
      )}
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center h-8 px-3"
        style={{ backgroundColor: color }}
      >
        <span className="text-sm font-medium text-black">{name}</span>
        <div className="flex-1" />

        {/* Move to tab button */}
        <div className="relative" ref={moveMenuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowMoveMenu(!showMoveMenu)
            }}
            className="w-6 h-6 flex items-center justify-center text-black/60 hover:text-black hover:bg-black/10 rounded transition-all mr-1"
            title="Move to tab"
          >
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} size="xs" />
          </button>

          {/* Dropdown menu */}
          {showMoveMenu && (
            <div className="absolute right-0 top-6 z-50 min-w-[140px] bg-bg-secondary border border-border rounded shadow-lg py-1">
              {otherTabs.length > 0 && (
                <>
                  {otherTabs.map((tab, idx) => (
                    <button
                      key={tab.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        onMoveToTab?.(godName, tab.id)
                        setShowMoveMenu(false)
                      }}
                      className="w-full px-3 py-1.5 text-left text-sm text-text-primary hover:bg-bg-tertiary flex items-center gap-2"
                    >
                      <span className="text-xs text-text-secondary opacity-60">{idx + 1}</span>
                      <span>{tab.name}</span>
                    </button>
                  ))}
                  <div className="border-t border-border my-1" />
                </>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onMoveToNewTab?.(godName)
                  setShowMoveMenu(false)
                }}
                className="w-full px-3 py-1.5 text-left text-sm text-text-primary hover:bg-bg-tertiary flex items-center gap-2"
              >
                <span className="text-xs text-text-secondary opacity-60">+</span>
                <span>New Tab</span>
              </button>
            </div>
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleFullscreen()
          }}
          className="w-6 h-6 flex items-center justify-center text-black/60 hover:text-black hover:bg-black/10 rounded transition-all mr-1"
          title={isFullscreen ? 'Exit fullscreen (Ctrl+F)' : 'Fullscreen (Ctrl+F)'}
        >
          <FontAwesomeIcon icon={isFullscreen ? faCompress : faExpand} size="xs" />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="w-6 h-6 flex items-center justify-center text-black/60 hover:text-black hover:bg-black/10 rounded transition-all"
          title="Banish (Ctrl+K)"
        >
          <FontAwesomeIcon icon={faXmark} size="sm" />
        </button>
      </div>

      {/* Terminal - absolute positioning gives explicit dimensions */}
      <div className="flex-1 relative min-h-0">
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{ backgroundColor: palette.background }}
        />
      </div>
    </div>
  )
}
