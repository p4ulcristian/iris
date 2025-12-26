import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store'

export default function HistoryPicker({ send }) {
  const [open, setOpen] = useState(false)
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedGod, setSelectedGod] = useState(null)
  const menuRef = useRef(null)
  const godColors = useStore(s => s.godColors)
  const getAllGodNames = useStore(s => s.getAllGodNames)

  // Get available gods
  const allGods = Object.keys(godColors)
  const usedGods = getAllGodNames().map(n => n.toLowerCase())
  const availableGods = allGods.filter(g => !usedGods.includes(g))
  const godPool = availableGods.length > 0 ? availableGods : allGods

  // Close menu when clicking outside
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
        setSelectedGod(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Handle WebSocket message for history:list
  useEffect(() => {
    if (!open) return

    const handleMessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.event === 'history:list') {
          setSessions(msg.sessions || [])
          setLoading(false)
        }
      } catch {}
    }

    // Get the WebSocket from the window (hacky but works)
    // The proper way would be to pass ws down, but this keeps it simple
    const ws = window.__irisWs
    if (ws) {
      ws.addEventListener('message', handleMessage)
      return () => ws.removeEventListener('message', handleMessage)
    }
  }, [open])

  const handleOpen = () => {
    setOpen(true)
    setLoading(true)
    setSessions([])
    send({ event: 'history:list', limit: 15 })
  }

  const handleSelectSession = (session) => {
    // Pick a random god from available pool
    const god = godPool[Math.floor(Math.random() * godPool.length)]
    setSelectedGod({ session, god })
  }

  const handleResume = () => {
    if (!selectedGod) return

    const { session, god } = selectedGod
    const name = god.charAt(0).toUpperCase() + god.slice(1)

    send({
      event: 'history:resume',
      sessionId: session.id,
      name,
      summary: session.summary
    })

    setOpen(false)
    setSelectedGod(null)
  }

  const formatTime = (isoString) => {
    const date = new Date(isoString)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={open ? () => setOpen(false) : handleOpen}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs hover:bg-bg-tertiary transition-colors"
        title="Resume a previous session"
      >
        <span className="opacity-70">&#x21BA;</span>
        <span>History</span>
        <span className="text-text-tertiary">▾</span>
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-1 w-80 max-h-96 bg-bg-secondary border border-border rounded shadow-lg z-50 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-border text-xs text-text-secondary font-medium">
            Resume Session
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="px-3 py-4 text-center text-text-tertiary text-xs">
                Loading sessions...
              </div>
            ) : sessions.length === 0 ? (
              <div className="px-3 py-4 text-center text-text-tertiary text-xs">
                No sessions found
              </div>
            ) : (
              sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => handleSelectSession(session)}
                  className={`w-full px-3 py-2 text-left text-xs transition-colors border-b border-border/50 last:border-0 ${
                    selectedGod?.session.id === session.id
                      ? 'bg-accent/10'
                      : 'hover:bg-bg-tertiary'
                  }`}
                >
                  <div className="text-text-primary line-clamp-2 mb-1">
                    {session.summary}
                  </div>
                  <div className="text-text-tertiary">
                    {formatTime(session.timestamp)}
                  </div>
                </button>
              ))
            )}
          </div>

          {selectedGod && (
            <div className="px-3 py-2 border-t border-border flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: godColors[selectedGod.god] }}
                />
                <span className="text-text-secondary">
                  {selectedGod.god.charAt(0).toUpperCase() + selectedGod.god.slice(1)}
                </span>
              </div>
              <button
                onClick={handleResume}
                className="px-3 py-1 text-xs font-medium rounded transition-all"
                style={{
                  backgroundColor: (godColors[selectedGod.god] || '#888') + '33',
                  color: godColors[selectedGod.god] || '#888',
                  borderWidth: '1px',
                  borderColor: (godColors[selectedGod.god] || '#888') + '66'
                }}
              >
                Resume
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
