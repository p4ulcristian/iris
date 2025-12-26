import { useEffect, useRef, useState, useMemo } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { generatePalette } from '../themes/generated/palettes'
import { getThemeTerminalSettings } from '../themes/generated/themes'
import { useStore } from '../store'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowUpRightFromSquare, faExpand, faCompress, faXmark } from '@fortawesome/free-solid-svg-icons'

// Convert hex color to RGB for ANSI escape codes
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return '255;255;255'
  return `${parseInt(result[1], 16)};${parseInt(result[2], 16)};${parseInt(result[3], 16)}`
}

export default function GodCard({ god, isFocused, isFullscreen, isHidden, onFocus, onDoubleClick, onClose, onToggleFullscreen, tabs, activeTabId, onMoveToTab, onMoveToNewTab, compact }) {
  const containerRef = useRef(null)
  const termRef = useRef(null)
  const fitAddonRef = useRef(null)
  const wsRef = useRef(null)
  const [showMoveMenu, setShowMoveMenu] = useState(false)
  const moveMenuRef = useRef(null)

  const { name, color } = god
  const godName = name

  // Get god color from server (single source of truth)
  const godColors = useStore(s => s.godColors)
  const godColor = godColors[name.toLowerCase()] || color  // fallback to prop color

  // Get theme terminal settings and generate palette using theme-specific god color
  const theme = useStore(s => s.theme)
  const themeTerminalSettings = useMemo(() => getThemeTerminalSettings(theme), [theme])
  const palette = useMemo(() => generatePalette(godColor, themeTerminalSettings), [godColor, themeTerminalSettings])

  // Update terminal theme when palette changes (theme switch)
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = palette
      // Force xterm to redraw with new colors
      termRef.current.refresh(0, termRef.current.rows - 1)
    }
  }, [palette])

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

  // Track previous hidden state to trigger refit when becoming visible
  const wasHiddenRef = useRef(isHidden)

  // Refit terminal when becoming visible (switching back to tab)
  useEffect(() => {
    if (wasHiddenRef.current && !isHidden && termRef.current && fitAddonRef.current) {
      // Delay to let layout settle after becoming visible
      const timeout = setTimeout(() => {
        try {
          fitAddonRef.current.fit()
          // Also notify server of new size
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              event: 'pty:resize',
              godName,
              cols: termRef.current.cols,
              rows: termRef.current.rows
            }))
          }
        } catch {}
      }, 50)
      wasHiddenRef.current = isHidden
      return () => clearTimeout(timeout)
    }
    wasHiddenRef.current = isHidden
  }, [isHidden, godName])

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
      try { fitAddon.fit() } catch {}
      ws.send(JSON.stringify({ event: 'pty:attach', godName, cols: term.cols, rows: term.rows }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.event === 'pty:output' && msg.godName === godName) {
          // Ensure data is a string before writing to terminal
          if (typeof msg.data === 'string') {
            term.write(msg.data)
          }
        }
      } catch {}
    }

    function sendWs(data) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data))
      }
    }

    // Show loading state immediately
    term.write(`\x1b[38;2;${hexToRgb(color)}m⟡ Summoning ${name}...\x1b[0m\r\n\r\n`)

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
  }, [godName, color]) // Note: palette is handled by separate useEffect to avoid terminal recreation

  return (
    <div
      onClick={onFocus}
      onDoubleClick={onDoubleClick}
      className="relative flex flex-col h-full min-h-0 bg-bg-primary rounded-lg overflow-hidden border-2 transition-all"
      style={{
        borderColor: isFocused ? godColor : '#333',
        boxShadow: isFocused ? `0 0 30px ${godColor}44` : 'none',
        viewTransitionName: `god-${name.toLowerCase()}`
      }}
    >
      {/* Passive overlay for unfocused panes */}
      {!isFocused && (
        <div className="absolute inset-0 bg-black/40 pointer-events-none z-10 rounded-lg" />
      )}
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center h-8 px-3"
        style={{ backgroundColor: godColor }}
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
