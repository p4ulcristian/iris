import { useEffect, useRef, useMemo, useState, useLayoutEffect } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { generatePalette, getThemeTerminalSettings } from '../themes'
import { useStore } from '../store'
import { WS_URL } from '../config'

// Convert hex color to RGB for ANSI escape codes
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return '255;255;255'
  return `${parseInt(result[1], 16)};${parseInt(result[2], 16)};${parseInt(result[3], 16)}`
}

// Approximate cell dimensions for initial sizing (before xterm renders)
const APPROX_CELL_WIDTH = 8.4
const APPROX_CELL_HEIGHT = 17

export default function TerminalContent({ entity, isFocused, isHidden, expectedWidth, expectedHeight }) {
  const containerRef = useRef(null)
  const termRef = useRef(null)
  const wsRef = useRef(null)
  const cellDimsRef = useRef(null) // Cache cell dimensions once available

  // Track which container the terminal is attached to (for hot reload detection)
  const attachedContainerRef = useRef(null)
  const [remountKey, setRemountKey] = useState(0)

  // Detect hot reload: container DOM changed but React preserved our refs
  useLayoutEffect(() => {
    if (attachedContainerRef.current && attachedContainerRef.current !== containerRef.current) {
      // Container changed - force terminal effect to re-run
      setRemountKey(k => k + 1)
    }
  })

  const { name, displayName, color } = entity
  const godName = name

  // Get god color from server - use custom color for terminals, theme color for gods
  const godColors = useStore(s => s.godColors)
  const godColor = displayName ? color : (godColors[name.toLowerCase()] || color)

  // Get theme terminal settings and generate palette using theme-specific god color
  const theme = useStore(s => s.theme)
  const themeTerminalSettings = useMemo(() => getThemeTerminalSettings(theme), [theme])
  const palette = useMemo(() => generatePalette(godColor, themeTerminalSettings), [godColor, themeTerminalSettings])

  // Helper: calculate cols/rows from pixel dimensions
  const calcDimensions = (width, height) => {
    const cellWidth = cellDimsRef.current?.width || APPROX_CELL_WIDTH
    const cellHeight = cellDimsRef.current?.height || APPROX_CELL_HEIGHT
    return {
      cols: Math.floor(width / cellWidth) || 80,
      rows: Math.floor(height / cellHeight) || 24
    }
  }

  // Helper: resize terminal and notify server
  const resizeTerminal = (cols, rows) => {
    const term = termRef.current
    if (!term || cols <= 0 || rows <= 0) return
    if (cols === term.cols && rows === term.rows) return
    // Don't resize if terminal isn't fully initialized
    if (!term._core?._renderService?.dimensions) return

    try {
      term.resize(cols, rows)
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          event: 'pty:resize',
          godName,
          cols,
          rows
        }))
      }
    } catch (e) {
      // Terminal might not be ready yet
    }
  }

  // Update terminal theme when palette changes (theme switch)
  const isGod = !entity.displayName
  useEffect(() => {
    if (termRef.current) {
      try {
        const termTheme = isGod
          ? { ...palette, cursor: 'transparent', cursorAccent: 'transparent' }
          : palette
        termRef.current.options.theme = termTheme
        termRef.current.refresh(0, termRef.current.rows - 1)
      } catch {}
    }
  }, [palette, isGod])

  // Resize when expected dimensions change (driven by parent's stable measurement)
  useEffect(() => {
    if (!termRef.current || !expectedWidth || !expectedHeight) return

    try {
      // Try to get actual cell dimensions from xterm
      const dims = termRef.current._core?._renderService?.dimensions
      if (dims?.css?.cell) {
        cellDimsRef.current = { width: dims.css.cell.width, height: dims.css.cell.height }
      }

      const { cols, rows } = calcDimensions(expectedWidth, expectedHeight)
      resizeTerminal(cols, rows)
    } catch {}
  }, [expectedWidth, expectedHeight, godName])

  // Focus and scroll when becoming focused
  useEffect(() => {
    if (isFocused && termRef.current) {
      // Small delay for animation to settle
      const timeout = setTimeout(() => {
        try {
          termRef.current?.scrollToBottom()
          termRef.current?.focus()
        } catch {}
      }, 100)
      return () => clearTimeout(timeout)
    }
  }, [isFocused])

  // Resize when becoming visible (tab switch) - dimensions might have changed while hidden
  const wasHiddenRef = useRef(isHidden)
  useEffect(() => {
    if (wasHiddenRef.current && !isHidden && termRef.current && expectedWidth && expectedHeight) {
      const timeout = setTimeout(() => {
        try {
          // Re-acquire cell dimensions in case they were lost
          const dims = termRef.current?._core?._renderService?.dimensions
          if (dims?.css?.cell) {
            cellDimsRef.current = { width: dims.css.cell.width, height: dims.css.cell.height }
          }
          const { cols, rows } = calcDimensions(expectedWidth, expectedHeight)
          resizeTerminal(cols, rows)
        } catch {}
      }, 50)
      wasHiddenRef.current = isHidden
      return () => clearTimeout(timeout)
    }
    wasHiddenRef.current = isHidden
  }, [isHidden, expectedWidth, expectedHeight, godName])

  // Main terminal setup
  useEffect(() => {
    if (!containerRef.current) return

    // Track current container for hot reload detection
    attachedContainerRef.current = containerRef.current

    // Initial size from expected dimensions
    const { cols: initialCols, rows: initialRows } = calcDimensions(
      expectedWidth || 800,
      expectedHeight || 600
    )

    // Gods (no displayName) hide cursor, terminals show it
    const termTheme = isGod
      ? { ...palette, cursor: 'transparent', cursorAccent: 'transparent' }
      : palette

    const term = new XTerm({
      cursorBlink: !isGod,
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace',
      rows: initialRows,
      cols: initialCols,
      theme: termTheme,
      allowTransparency: true
    })

    term.open(containerRef.current)
    termRef.current = term

    // After first render, capture actual cell dimensions and resize accurately
    const onFirstRender = term.onRender(() => {
      onFirstRender.dispose()

      try {
        const dims = term._core?._renderService?.dimensions
        if (dims?.css?.cell) {
          cellDimsRef.current = { width: dims.css.cell.width, height: dims.css.cell.height }

          // Now resize with accurate cell dimensions
          if (expectedWidth && expectedHeight) {
            const { cols, rows } = calcDimensions(expectedWidth, expectedHeight)
            resizeTerminal(cols, rows)
          }
        }
      } catch {}
    })

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

    // Listen for global refit event (god count changes)
    const handleRefit = () => {
      try {
        if (!expectedWidth || !expectedHeight) return
        const { cols, rows } = calcDimensions(expectedWidth, expectedHeight)
        resizeTerminal(cols, rows)
      } catch {}
    }
    window.addEventListener('iris:refit', handleRefit)

    // Send user input to PTY
    term.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ event: 'pty:input', godName, data }))
      }
    })

    // WebSocket connection
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ event: 'pty:attach', godName, cols: term.cols, rows: term.rows }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.event === 'pty:output' && msg.godName === godName) {
          if (typeof msg.data === 'string') {
            term.write(msg.data)
          }
        }
      } catch {}
    }

    // Show loading state immediately
    term.write(`\x1b[38;2;${hexToRgb(color)}m⟡ ${entity.displayName ? 'Starting' : 'Summoning'} ${entity.displayName || name}...\x1b[0m\r\n\r\n`)

    term.focus()

    return () => {
      onFirstRender.dispose()
      window.removeEventListener('iris:refit', handleRefit)
      if (textarea) {
        textarea.removeEventListener('keydown', handleShortcut, true)
      }
      container.removeEventListener('keydown', handleShortcut, true)
      term.dispose()
      ws.close()
    }
  }, [godName, color, remountKey])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
    />
  )
}
