import { useEffect, useRef, useMemo, useState, useLayoutEffect } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { ClipboardAddon } from '@xterm/addon-clipboard'
import { generatePalette, getThemeTerminalSettings } from '@/themes'
import { useStore } from '@/store'
import { WS_URL } from '@/config'

// Convert hex color to RGB for ANSI escape codes
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return '255;255;255'
  return `${parseInt(result[1], 16)};${parseInt(result[2], 16)};${parseInt(result[3], 16)}`
}

// Approximate cell dimensions for initial sizing (before xterm renders)
const APPROX_CELL_WIDTH = 8.4
const APPROX_CELL_HEIGHT = 17

// Resize polling interval (ms)
const RESIZE_POLL_INTERVAL = 200

export default function TerminalContent({ entity, isFocused, isHidden }) {
  const containerRef = useRef(null)
  const termRef = useRef(null)
  const wsRef = useRef(null)
  const cellDimsRef = useRef(null)
  const lastSizeRef = useRef({ cols: 0, rows: 0 })

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

  // Capture initial color for loading message (don't want color changes to recreate terminal)
  const initialColorRef = useRef(color)

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


  // Focus when becoming focused
  useEffect(() => {
    if (isFocused && termRef.current) {
      const timeout = setTimeout(() => {
        try {
          termRef.current?.focus()
        } catch {}
      }, 100)
      return () => clearTimeout(timeout)
    }
  }, [isFocused])

  // Handle scroll events from App.jsx (Shift+Arrow)
  useEffect(() => {
    if (!isFocused) return

    const handleScroll = (e) => {
      const term = termRef.current
      if (!term) return

      switch (e.detail.key) {
        case 'ArrowUp': term.scrollLines(-5); break
        case 'ArrowDown': term.scrollLines(5); break
        case 'PageUp': term.scrollLines(-term.rows); break
        case 'PageDown': term.scrollLines(term.rows); break
      }
      term.refresh(0, term.rows - 1)
    }

    window.addEventListener('iris:scroll-terminal', handleScroll)
    return () => window.removeEventListener('iris:scroll-terminal', handleScroll)
  }, [isFocused])


  // Main terminal setup
  useEffect(() => {
    if (!containerRef.current) return

    // Track current container for hot reload detection
    attachedContainerRef.current = containerRef.current

    // Initial size from actual container measurement
    const rect = containerRef.current.getBoundingClientRect()
    const { cols: initialCols, rows: initialRows } = calcDimensions(
      rect.width || 800,
      rect.height || 600
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
      allowTransparency: true,
      scrollback: 10000
    })

    term.open(containerRef.current)
    termRef.current = term

    // Load clipboard addon for OSC 52 support
    const clipboardAddon = new ClipboardAddon()
    term.loadAddon(clipboardAddon)


    // Helper to measure and update cell dimensions
    const updateCellDimensions = () => {
      try {
        const dims = term._core?._renderService?.dimensions
        if (dims?.css?.cell) {
          const newWidth = dims.css.cell.width
          const newHeight = dims.css.cell.height
          const current = cellDimsRef.current

          // Only update if dimensions changed
          if (!current || current.width !== newWidth || current.height !== newHeight) {
            cellDimsRef.current = { width: newWidth, height: newHeight }
            return true // dimensions changed
          }
        }
      } catch {}
      return false
    }

    // Capture cell dimensions after first render
    const onFirstRender = term.onRender(() => {
      onFirstRender.dispose()
      updateCellDimensions()
    })

    // Re-measure after fonts load for precision
    document.fonts.ready.then(() => {
      if (updateCellDimensions()) {
        // Fonts caused dimension change - refit terminal
        const rect = containerRef.current?.getBoundingClientRect()
        if (rect && rect.width > 50 && rect.height > 50) {
          const { cols, rows } = calcDimensions(rect.width, rect.height)
          if (cols > 0 && rows > 0 && (cols !== term.cols || rows !== term.rows)) {
            term.resize(cols, rows)
          }
        }
      }
    })

    const textarea = term.textarea

    // Intercept keyboard shortcuts before xterm handles them
    const handleShortcut = (e) => {
      const key = e.key.toLowerCase()

      // Cmd+C (macOS) or Ctrl+Shift+C (Linux) to copy selection
      const isCopyShortcut = (e.metaKey && key === 'c') || (e.ctrlKey && e.shiftKey && key === 'c')
      if (isCopyShortcut && term.hasSelection()) {
        e.preventDefault()
        e.stopPropagation()
        navigator.clipboard.writeText(term.getSelection())
        return
      }

      // Cmd+V (macOS) or Ctrl+Shift+V (Linux) to paste
      const isPasteShortcut = (e.metaKey && key === 'v') || (e.ctrlKey && e.shiftKey && key === 'v')
      if (isPasteShortcut) {
        e.preventDefault()
        e.stopPropagation()
        navigator.clipboard.readText().then(text => {
          if (text) {
            term.paste(text)
          }
        }).catch(err => console.error('Paste failed:', err))
        return
      }

      const isCtrlShortcut = e.ctrlKey && !e.shiftKey && ['n', 'k', 'f', 'l', 'd', 'r'].includes(key)
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

    // Simple polling for resize - reliable and self-healing
    const resizePoll = setInterval(() => {
      try {
        const { width, height } = container.getBoundingClientRect()
        if (width < 50 || height < 50) return

        updateCellDimensions()
        const { cols, rows } = calcDimensions(width, height)

        // Only resize if dimensions actually changed
        if (cols > 0 && rows > 0 &&
            (cols !== lastSizeRef.current.cols || rows !== lastSizeRef.current.rows)) {
          lastSizeRef.current = { cols, rows }
          term.resize(cols, rows)

          // Send to server if WebSocket is ready
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              event: 'pty:resize',
              godName,
              cols,
              rows
            }))
          }
        }
      } catch {}
    }, RESIZE_POLL_INTERVAL)

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
      console.log(`[TerminalContent] ${godName}: WebSocket opened, sending pty:attach`)
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
      } catch (e) {
        console.error(`[TerminalContent] ${godName}: error`, e)
      }
    }

    // Show loading state immediately
    term.write(`\x1b[38;2;${hexToRgb(initialColorRef.current)}m⟡ ${entity.displayName ? 'Starting' : 'Summoning'} ${entity.displayName || name}...\x1b[0m\r\n\r\n`)

    term.focus()

    return () => {
      onFirstRender.dispose()
      clearInterval(resizePoll)
      if (textarea) {
        textarea.removeEventListener('keydown', handleShortcut, true)
      }
      container.removeEventListener('keydown', handleShortcut, true)
      term.dispose()
      ws.close()
    }
  }, [godName, remountKey])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 entity-content"
    />
  )
}
