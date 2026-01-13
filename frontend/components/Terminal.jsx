import { useEffect, useRef, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'

export default function Terminal({ sessionName, color, onData, onResize }) {
  const containerRef = useRef(null)
  const termRef = useRef(null)

  // Write data to terminal
  const write = useCallback((data) => {
    if (termRef.current) {
      termRef.current.write(data)
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    // Create terminal
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace',
      allowTransparency: true,
      scrollback: 10000,
      theme: {
        background: 'transparent',
        foreground: '#e0e0e0',
        cursor: color,
        cursorAccent: '#0a0a0a',
        selectionBackground: `${color}40`
      }
    })

    term.open(containerRef.current)
    termRef.current = term

    // Report initial size
    if (onResize) {
      onResize(term.cols, term.rows)
    }

    // Handle user input
    term.onData((data) => {
      if (onData) {
        onData(data)
      }
    })

    return () => {
      term.dispose()
    }
  }, [color, onData, onResize])

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden"
      style={{ minHeight: 0 }}
    />
  )
}
