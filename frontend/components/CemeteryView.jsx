import { useState, useCallback } from 'react'
import { useStore } from '../store'

function formatTimeSince(timestamp) {
  const now = Date.now()
  const diffMs = now - timestamp
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  const date = new Date(timestamp)
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: diffDays > 365 ? 'numeric' : undefined
  })
}

function FallenGodCard({ fallen, onResurrect, onRemove }) {
  const displayName = fallen.title || fallen.mission || 'No mission recorded'

  return (
    <div className="group p-4 bg-black/30 border border-white/10 rounded-xl hover:bg-black/40 hover:border-white/20 transition-all">
      <div className="flex items-start gap-3">
        {/* God identity */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium shrink-0"
          style={{
            backgroundColor: `${fallen.color}20`,
            borderColor: `${fallen.color}40`,
            borderWidth: '1px',
            color: fallen.color
          }}
        >
          {fallen.name?.charAt(0) || '?'}
        </div>

        <div className="flex-1 min-w-0">
          {/* Name and time */}
          <div className="flex items-center gap-2 mb-1">
            <span
              className="font-medium text-sm"
              style={{ color: fallen.color }}
            >
              {fallen.name}
            </span>
            <span className="text-text-tertiary text-xs">
              {formatTimeSince(fallen.banishedAt)}
            </span>
          </div>

          {/* Mission/title */}
          <p className="text-text-secondary text-sm leading-relaxed mb-2 truncate">
            {displayName}
          </p>

          {/* Tab info */}
          <div className="text-xs text-text-tertiary">
            <span className="opacity-70">from</span> {fallen.tabName}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {fallen.sessionId && (
            <button
              onClick={() => onResurrect(fallen)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-all"
            >
              Resurrect
            </button>
          )}
          <button
            onClick={() => onRemove(fallen)}
            className="px-2 py-1.5 text-xs font-medium rounded-lg bg-red-500/10 text-red-400/60 border border-red-500/20 hover:bg-red-500/20 hover:text-red-400 transition-all"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CemeteryView({ send }) {
  const cemetery = useStore(s => s.cemetery)
  const [search, setSearch] = useState('')

  const handleResurrect = useCallback((fallen) => {
    send({
      event: 'cemetery:resurrect',
      godId: fallen.id,
      name: fallen.name,
      sessionId: fallen.sessionId,
      mission: fallen.mission,
      title: fallen.title
    })
  }, [send])

  const handleRemove = useCallback((fallen) => {
    send({
      event: 'cemetery:remove',
      sessionId: fallen.sessionId
    })
  }, [send])

  const handleClearAll = useCallback(() => {
    if (cemetery.length === 0) return
    send({ event: 'cemetery:clear' })
  }, [send, cemetery.length])

  // Filter by search
  const filtered = search.trim()
    ? cemetery.filter(f =>
        f.name?.toLowerCase().includes(search.toLowerCase()) ||
        f.mission?.toLowerCase().includes(search.toLowerCase()) ||
        f.title?.toLowerCase().includes(search.toLowerCase()) ||
        f.tabName?.toLowerCase().includes(search.toLowerCase())
      )
    : cemetery

  return (
    <div className="h-full flex flex-col">
      {/* Header with search and clear */}
      <div className="flex items-center gap-4 mb-4">
        <div className="relative flex-1 max-w-md">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">
            🔍
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fallen gods..."
            className="w-full pl-10 pr-4 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 transition-colors"
          />
        </div>

        {cemetery.length > 0 && (
          <button
            onClick={handleClearAll}
            className="px-3 py-2 text-xs font-medium rounded-lg bg-red-500/10 text-red-400/60 border border-red-500/20 hover:bg-red-500/20 hover:text-red-400 transition-all"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Fallen gods list */}
      <div className="flex-1 overflow-y-auto pr-2">
        {cemetery.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
            <p className="text-3xl mb-3 opacity-50">🪦</p>
            <p className="text-base mb-1">No fallen gods</p>
            <p className="text-sm opacity-70">Banished gods will appear here</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
            <p className="text-base mb-1">No matching gods</p>
            <p className="text-sm opacity-70">Try a different search term</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((fallen, idx) => (
              <FallenGodCard
                key={fallen.sessionId || `${fallen.id}-${idx}`}
                fallen={fallen}
                onResurrect={handleResurrect}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
