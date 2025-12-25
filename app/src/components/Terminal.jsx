import { useEffect, useRef, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'

export default function Terminal({ sessionName, color, onData, onResize }) {
  const containerRef = useRef(null)
  const termRef = useRef(null)
  const fitAddonRef = useRef(null)
  const resizeObserverRef = useRef(null)

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
      if (onResize) {
        onResize(term.cols, term.rows)
      }
    })

    // Handle user input
    term.onData((data) => {
      if (onData) {
        onData(data)
      }
    })

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit()
        if (onResize && termRef.current) {
          onResize(termRef.current.cols, termRef.current.rows)
        }
      }
    })
    resizeObserver.observe(containerRef.current)
    resizeObserverRef.current = resizeObserver

    return () => {
      resizeObserver.disconnect()
      term.dispose()
    }
  }, [color, onData, onResize])

  // Expose write function via ref callback
  useEffect(() => {
    // Connect to PTY output via WebSocket
    // The parent component will call write() when data arrives
  }, [])

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden"
      style={{ minHeight: 0 }}
    />
  )
}

// Export a hook for external control
export function useTerminal() {
  const terminalRef = useRef(null)

  const write = useCallback((data) => {
    if (terminalRef.current?.write) {
      terminalRef.current.write(data)
    }
  }, [])

  return { terminalRef, write }
}
