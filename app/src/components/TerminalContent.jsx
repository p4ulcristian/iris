import { useEffect, useRef, useMemo, useState, useLayoutEffect } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { ClipboardAddon } from '@xterm/addon-clipboard'
import { FitAddon } from '@xterm/addon-fit'
import { generatePalette, getThemeTerminalSettings } from '../themes'
import { useStore } from '../store'
import { WS_URL } from '../config'

// Convert hex color to RGB for ANSI escape codes
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return '255;255;255'
  return `${parseInt(result[1], 16)};${parseInt(result[2], 16)};${parseInt(result[3], 16)}`
}

export default function TerminalContent({ entity, isFocused, isHidden }) {
  const containerRef = useRef(null)
  const termRef = useRef(null)
  const wsRef = useRef(null)
  const fitAddonRef = useRef(null)
  const resizeTimeoutRef = useRef(null)

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

  // Resize when becoming visible (tab switch) - trigger a refit
  const wasHiddenRef = useRef(isHidden)
  useEffect(() => {
    if (wasHiddenRef.current && !isHidden && fitAddonRef.current) {
      const timeout = setTimeout(() => {
        try {
          fitAddonRef.current?.fit()
        } catch {}
      }, 50)
      wasHiddenRef.current = isHidden
      return () => clearTimeout(timeout)
    }
    wasHiddenRef.current = isHidden
  }, [isHidden])

  // Main terminal setup
  useEffect(() => {
    if (!containerRef.current) return

    // Track current container for hot reload detection
    attachedContainerRef.current = containerRef.current

    // Gods (no displayName) hide cursor, terminals show it
    const termTheme = isGod
      ? { ...palette, cursor: 'transparent', cursorAccent: 'transparent' }
      : palette

    const term = new XTerm({
      cursorBlink: !isGod,
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace',
      theme: termTheme,
      allowTransparency: true,
      scrollback: 10000
    })

    term.open(containerRef.current)
    termRef.current = term

    // Load clipboard addon for OSC 52 support
    const clipboardAddon = new ClipboardAddon()
    term.loadAddon(clipboardAddon)

    // Load fit addon for proper sizing
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    fitAddonRef.current = fitAddon

    // Initial fit after render service is ready
    requestAnimationFrame(() => {
      try {
        fitAddon.fit()
      } catch {}
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

    // ResizeObserver: fit terminal to container
    const resizeObserver = new ResizeObserver((entries) => {
      // Debounce to avoid excessive resize events during animations/drags
      clearTimeout(resizeTimeoutRef.current)
      resizeTimeoutRef.current = setTimeout(() => {
        const { width, height } = entries[0].contentRect
        if (width < 50 || height < 50) return // Too small, skip

        try {
          fitAddon.fit()
        } catch {}
      }, 50)
    })
    resizeObserver.observe(container)

    // onResize: single source of truth for notifying server
    const onResizeDisposable = term.onResize(({ cols, rows }) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          event: 'pty:resize',
          godName,
          cols,
          rows
        }))
      }
    })

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
    term.write(`\x1b[38;2;${hexToRgb(color)}m⟡ ${entity.displayName ? 'Starting' : 'Summoning'} ${entity.displayName || name}...\x1b[0m\r\n\r\n`)

    term.focus()

    return () => {
      onResizeDisposable.dispose()
      clearTimeout(resizeTimeoutRef.current)
      resizeObserver.disconnect()
      fitAddonRef.current = null
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
      className="absolute inset-0 terminal-content"
    />
  )
}
