import { useEffect, useRef, useMemo, useState, useLayoutEffect, useCallback } from 'react'
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
const APPROX_CELL_WIDTH = 9
const APPROX_CELL_HEIGHT = 17

// xterm has 4px padding on each side (see index.css .xterm)
const XTERM_PADDING = 8

// Resize polling interval (ms)
const RESIZE_POLL_INTERVAL = 200
// Debounce delay before sending resize to server (ms)
const RESIZE_DEBOUNCE_DELAY = 300

export default function TerminalContent({ entity, isFocused }) {
  const containerRef = useRef(null)
  const termRef = useRef(null)
  const wsRef = useRef(null)
  const cellDimsRef = useRef(null)
  const lastSizeRef = useRef({ cols: 0, rows: 0 })
  const lastPixelsRef = useRef({ width: 0, height: 0 })
  const resizeDebounceRef = useRef(null)

  const { name, displayName, color } = entity
  const godName = name

  // Track which container the terminal is attached to (for hot reload detection)
  const attachedContainerRef = useRef(null)
  const [remountKey, setRemountKey] = useState(0)

  // Detect container change: force terminal remount if container DOM node changes
  useLayoutEffect(() => {
    if (attachedContainerRef.current && attachedContainerRef.current !== containerRef.current) {
      console.warn(`[${godName}] Container changed! old=${attachedContainerRef.current?.className} new=${containerRef.current?.className}`)
      setRemountKey(k => k + 1)
    }
    // Always update the attached ref
    attachedContainerRef.current = containerRef.current
  })

  // Log mount/unmount
  useEffect(() => {
    console.warn(`[${godName}] Component mounted, remountKey=${remountKey}`)
    return () => console.warn(`[${godName}] Component unmounting`)
  }, [godName, remountKey])

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
  // Subtract xterm padding (8px total) from container size
  const calcDimensions = (width, height) => {
    const cellWidth = cellDimsRef.current?.width || APPROX_CELL_WIDTH
    const cellHeight = cellDimsRef.current?.height || APPROX_CELL_HEIGHT
    return {
      cols: Math.floor((width - XTERM_PADDING) / cellWidth) || 80,
      rows: Math.floor((height - XTERM_PADDING) / cellHeight) || 24
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

  // Handle scroll events from App.jsx (Shift+Arrow) - forward to Zellij
  useEffect(() => {
    if (!isFocused) return

    const handleScroll = (e) => {
      const term = termRef.current
      if (!term || wsRef.current?.readyState !== WebSocket.OPEN) return

      // Determine scroll amount
      let lines = 0
      switch (e.detail.key) {
        case 'ArrowUp': lines = -5; break
        case 'ArrowDown': lines = 5; break
        case 'PageUp': lines = -term.rows; break
        case 'PageDown': lines = term.rows; break
      }

      // Forward to Zellij via SGR mouse sequences
      const button = lines > 0 ? 65 : 64
      const count = Math.abs(lines)
      for (let i = 0; i < count; i++) {
        wsRef.current.send(JSON.stringify({ event: 'pty:input', godName, data: `\x1b[<${button};1;1M` }))
      }
    }

    window.addEventListener('iris:scroll-terminal', handleScroll)
    return () => window.removeEventListener('iris:scroll-terminal', handleScroll)
  }, [isFocused, godName])



  // Main terminal setup
  useEffect(() => {
    if (!containerRef.current) return

    console.warn(`[${godName}] Terminal effect running, container:`, containerRef.current)

    // Track current container for hot reload detection
    attachedContainerRef.current = containerRef.current

    // Initial size from actual container measurement (use offset* to ignore transforms)
    const { cols: initialCols, rows: initialRows } = calcDimensions(
      containerRef.current.offsetWidth || 800,
      containerRef.current.offsetHeight || 600
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
      scrollback: 0  // No xterm scrollback - Zellij manages history
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
        const el = containerRef.current
        if (el && el.offsetWidth > 50 && el.offsetHeight > 50) {
          const { cols, rows } = calcDimensions(el.offsetWidth, el.offsetHeight)
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
        ['n', 'k', 'f', ',', '.'].includes(key) ||
        (e.key >= '1' && e.key <= '9')
      )

      if (isCtrlShortcut || isAltShortcut) {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: e.key,
          code: e.code,
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
    // Use offsetWidth/Height instead of getBoundingClientRect to ignore CSS transforms
    // (Framer Motion uses scale/rotate which affects getBoundingClientRect)
    const resizePoll = setInterval(() => {
      try {
        const width = container.offsetWidth
        const height = container.offsetHeight
        if (width < 50 || height < 50) return

        // Skip if pixel dimensions unchanged (most common case)
        if (width === lastPixelsRef.current.width &&
            height === lastPixelsRef.current.height) {
          return
        }
        lastPixelsRef.current = { width, height }

        updateCellDimensions()
        const { cols, rows } = calcDimensions(width, height)

        // Only resize if cols/rows actually changed
        if (cols > 0 && rows > 0 &&
            (cols !== lastSizeRef.current.cols || rows !== lastSizeRef.current.rows)) {
          lastSizeRef.current = { cols, rows }
          term.resize(cols, rows)
          console.warn(`[${godName}] Resize ${cols}x${rows}`)

          // Debounce server resize - only send after size is stable
          // This prevents rapid resize events from corrupting Zellij scrollback
          if (resizeDebounceRef.current) {
            clearTimeout(resizeDebounceRef.current)
          }
          resizeDebounceRef.current = setTimeout(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              console.warn(`[${godName}] Sending debounced resize to server: ${cols}x${rows}`)
              wsRef.current.send(JSON.stringify({
                event: 'pty:resize',
                godName,
                cols,
                rows
              }))
            }
          }, RESIZE_DEBOUNCE_DELAY)
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
      console.warn(`[TerminalContent] ${godName}: WebSocket opened, sending pty:attach`)
      ws.send(JSON.stringify({ event: 'pty:attach', godName, cols: term.cols, rows: term.rows }))
    }

    let isFirstMessage = true
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.event === 'pty:output' && msg.godName === godName) {
          if (typeof msg.data === 'string') {
            term.write(msg.data)
            // After initial buffer replay, reset scroll state and log buffer info
            if (isFirstMessage && msg.data.length > 500) {
              isFirstMessage = false
              console.warn(`[${godName}] Buffer received: ${msg.data.length} chars`)
              setTimeout(() => {
                const buffer = term.buffer?.active
                console.warn(`[${godName}] After write: type=${buffer?.type}, base=${buffer?.baseY}, viewport=${buffer?.viewportY}, length=${buffer?.length}`)
                term.scrollToBottom()
                term.refresh(0, term.rows - 1)
              }, 100)
            }
          }
        }
      } catch (e) {
        console.error(`[TerminalContent] ${godName}: error`, e)
      }
    }

    // Show loading state immediately
    term.write(`\x1b[38;2;${hexToRgb(initialColorRef.current)}m⟡ ${entity.displayName ? 'Starting' : 'Summoning'} ${entity.displayName || name}...\x1b[0m\r\n\r\n`)

    term.focus()

    // Wheel handler - always forward to Zellij (no xterm scrollback)
    // SGR mouse format: \x1b[<button;x;yM where button is 64 (up) or 65 (down)
    const handleWheel = (e) => {
      if (!container.contains(e.target)) return

      const button = e.deltaY > 0 ? 65 : 64
      const scrollCount = Math.max(1, Math.abs(Math.round(e.deltaY / 50)))
      for (let i = 0; i < scrollCount; i++) {
        wsRef.current?.send(JSON.stringify({ event: 'pty:input', godName, data: `\x1b[<${button};1;1M` }))
      }
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('wheel', handleWheel, { capture: true, passive: false })

    return () => {
      console.warn(`[${godName}] Terminal effect cleanup - disposing xterm`)
      window.removeEventListener('wheel', handleWheel, { capture: true })
      onFirstRender.dispose()
      clearInterval(resizePoll)
      if (resizeDebounceRef.current) {
        clearTimeout(resizeDebounceRef.current)
      }
      if (textarea) {
        textarea.removeEventListener('keydown', handleShortcut, true)
      }
      container.removeEventListener('keydown', handleShortcut, true)
      term.dispose()
      ws.close()
    }
  }, [godName, remountKey])


  // Focus terminal when container is clicked (handles DOM focus loss)
  const handleContainerClick = useCallback(() => {
    if (termRef.current) {
      termRef.current.focus()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 entity-content"
      onClick={handleContainerClick}
    />
  )
}
