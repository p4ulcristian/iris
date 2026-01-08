import { useState, useRef, useEffect, useCallback } from 'react'
import { useStore } from '@/store'
import { ActionButton, Card, Input, formatTimeSince } from '../../_ui'

function groupSessionsByDay(sessions) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)

  const groups = {
    today: [],
    yesterday: [],
    thisWeek: [],
    older: []
  }

  sessions.forEach(session => {
    const date = new Date(session.timestamp)
    if (date >= today) {
      groups.today.push(session)
    } else if (date >= yesterday) {
      groups.yesterday.push(session)
    } else if (date >= weekAgo) {
      groups.thisWeek.push(session)
    } else {
      groups.older.push(session)
    }
  })

  return groups
}

function extractProject(cwd) {
  if (!cwd) return null
  // Get last folder name from path
  const parts = cwd.split('/')
  return parts[parts.length - 1] || parts[parts.length - 2]
}

function SessionCard({ session, onResume }) {
  const project = extractProject(session.cwd)

  return (
    <Card hover>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-text-primary text-sm leading-relaxed mb-2">
            "{session.summary}"
          </p>
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            {project && (
              <>
                <span className="flex items-center gap-1">
                  <span className="opacity-70">📁</span>
                  {project}
                </span>
                <span>·</span>
              </>
            )}
            <span>{formatTimeSince(new Date(session.timestamp).getTime())}</span>
          </div>
        </div>
        <ActionButton
          variant="accent"
          compact
          onClick={() => onResume(session)}
          className="opacity-0 group-hover:opacity-100"
        >
          Resume ▸
        </ActionButton>
      </div>
    </Card>
  )
}

function SessionGroup({ title, sessions, onResume }) {
  if (sessions.length === 0) return null

  return (
    <div className="mb-6">
      <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3 px-1">
        {title}
      </h3>
      <div className="flex flex-col gap-2">
        {sessions.map(session => (
          <SessionCard
            key={session.id}
            session={session}
            onResume={onResume}
          />
        ))}
      </div>
    </div>
  )
}

export default function HistoryView({ send }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const scrollRef = useRef(null)
  const loadMoreRef = useRef(null)

  const godColors = useStore(s => s.godColors)
  const getAllGodNames = useStore(s => s.getAllGodNames)

  const BATCH_SIZE = 20

  // Get available god for resume
  const getAvailableGod = useCallback(() => {
    const allGods = Object.keys(godColors)
    const usedGods = getAllGodNames().map(n => n.toLowerCase())
    const available = allGods.filter(g => !usedGods.includes(g))
    const pool = available.length > 0 ? available : allGods
    return pool[Math.floor(Math.random() * pool.length)]
  }, [godColors, getAllGodNames])

  // Load sessions
  const loadSessions = useCallback((reset = false) => {
    if (reset) {
      setLoading(true)
      setOffset(0)
      setSessions([])
    } else {
      setLoadingMore(true)
    }

    send({ event: 'history:list', limit: BATCH_SIZE, offset: reset ? 0 : offset })
  }, [send, offset])

  // Initial load
  useEffect(() => {
    loadSessions(true)
  }, [])

  // Handle WebSocket messages
  useEffect(() => {
    const handleMessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.event === 'history:list') {
          const newSessions = msg.sessions || []

          if (offset === 0 || loading) {
            setSessions(newSessions)
          } else {
            setSessions(prev => [...prev, ...newSessions])
          }

          setHasMore(newSessions.length === BATCH_SIZE)
          setOffset(prev => prev + newSessions.length)
          setLoading(false)
          setLoadingMore(false)
        }
      } catch {}
    }

    const ws = window.__irisWs
    if (ws) {
      ws.addEventListener('message', handleMessage)
      return () => ws.removeEventListener('message', handleMessage)
    }
  }, [offset, loading])

  // Infinite scroll observer
  useEffect(() => {
    if (!loadMoreRef.current || loading || loadingMore || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadSessions(false)
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(loadMoreRef.current)
    return () => observer.disconnect()
  }, [loading, loadingMore, hasMore, loadSessions])

  // Resume a session
  const handleResume = useCallback((session) => {
    const god = getAvailableGod()
    const name = god.charAt(0).toUpperCase() + god.slice(1)

    send({
      event: 'history:resume',
      sessionId: session.id,
      name,
      summary: session.summary
    })

    // Switch to work view after resuming
    send({ event: 'view:set', view: 'work' })
  }, [send, getAvailableGod])

  // Filter sessions by search
  const filteredSessions = search.trim()
    ? sessions.filter(s =>
        s.summary.toLowerCase().includes(search.toLowerCase()) ||
        (s.cwd && s.cwd.toLowerCase().includes(search.toLowerCase()))
      )
    : sessions

  // Group by day
  const grouped = groupSessionsByDay(filteredSessions)

  return (
    <div className="h-full flex flex-col">
      {/* Search bar */}
      <div className="mb-4">
        <div className="relative max-w-md">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">
            🔍
          </span>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sessions..."
            className="pl-10"
          />
        </div>
      </div>

      {/* Sessions list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto pr-2">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <span className="text-text-tertiary text-sm">Loading sessions...</span>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
            {search ? (
              <>
                <p className="text-base mb-1">No matching sessions</p>
                <p className="text-sm opacity-70">Try a different search term</p>
              </>
            ) : (
              <>
                <p className="text-base mb-1">No sessions yet</p>
                <p className="text-sm opacity-70">Start working with a god to create history</p>
              </>
            )}
          </div>
        ) : (
          <>
            <SessionGroup title="Today" sessions={grouped.today} onResume={handleResume} />
            <SessionGroup title="Yesterday" sessions={grouped.yesterday} onResume={handleResume} />
            <SessionGroup title="This Week" sessions={grouped.thisWeek} onResume={handleResume} />
            <SessionGroup title="Older" sessions={grouped.older} onResume={handleResume} />

            {/* Load more trigger */}
            {hasMore && (
              <div ref={loadMoreRef} className="py-4 text-center">
                {loadingMore && (
                  <span className="text-text-tertiary text-sm">Loading more...</span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
