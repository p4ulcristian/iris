import { useState, useEffect } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import { useStore } from '../store'

function formatElapsed(ms) {
  if (!ms || ms < 0) return null
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else {
    return `${seconds}s`
  }
}

export default function GodTaskCard({ god, isActive, onClick, onClose }) {
  const { name, displayName, color, title, status, mission, readyState, spawnedAt } = god
  const [elapsed, setElapsed] = useState(null)
  const dragControls = useDragControls()

  useEffect(() => {
    if (!spawnedAt) return

    const update = () => setElapsed(Date.now() - spawnedAt)
    update()

    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [spawnedAt])

  // Get god color from server - use custom color for terminals, theme color for gods
  const godColors = useStore(s => s.godColors)
  const godColor = displayName ? color : (godColors[name.toLowerCase()] || color)

  // Title: the goal (set via focus skill) or initial mission
  const displayTitle = title || mission
  // Status: current action from hook (only show if different from title)
  const displayStatus = status && status !== displayTitle ? status : null

  // Get CSS class for ready state
  const getReadyClass = () => {
    switch (readyState) {
      case 'working': return 'task-working'
      case 'done': return 'task-done'
      case 'stuck': return 'task-stuck'
      case 'question': return 'task-question'
      default: return 'task-working'
    }
  }

  return (
    <Reorder.Item
      value={god}
      dragListener={true}
      dragControls={dragControls}
      onClick={onClick}
      className={`group relative w-full rounded-lg cursor-grab active:cursor-grabbing overflow-hidden border-2 transition-colors ${getReadyClass()}`}
      style={{
        '--god-color': godColor,
        '--god-color-alpha': `${godColor}88`,
        borderColor: isActive ? godColor : '#333',
        boxShadow: isActive ? `0 0 30px ${godColor}44` : 'none',
        backgroundColor: 'var(--bg-primary)'
      }}
      initial={false}
      animate={{
        scale: isActive ? 1.02 : 1,
        y: isActive ? -2 : 0
      }}
      whileHover={!isActive ? { scale: 1.01, y: -1 } : {}}
      whileTap={!isActive ? { scale: 0.98 } : {}}
      whileDrag={{
        scale: 1.05,
        boxShadow: `0 0 40px ${godColor}88, 0 20px 40px rgba(0,0,0,0.3)`,
        cursor: 'grabbing'
      }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 25,
        scale: { type: 'spring', stiffness: 500, damping: 30 },
        y: { type: 'spring', stiffness: 500, damping: 30 }
      }}
    >
      {/* Header - same style as GodCard */}
      <div
        className="flex items-center h-8 px-3"
        style={{ backgroundColor: godColor }}
      >
        <span className="text-sm font-medium text-black truncate flex-1">
          {displayName || name}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="w-6 h-6 flex items-center justify-center text-black/60 hover:text-black hover:bg-black/10 rounded transition-all"
          title="Banish"
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div className="px-3 py-2">
        {/* Title (goal) */}
        {displayTitle && (
          <span className="text-sm block font-medium text-text-secondary">
            {displayTitle}
          </span>
        )}
        {/* Status (current action) */}
        {displayStatus && (
          <span className="text-xs mt-0.5 block text-text-secondary opacity-70">
            {displayStatus}
          </span>
        )}
        {/* Elapsed time */}
        {elapsed !== null && (
          <span className="text-xs font-mono mt-1 block text-right text-text-secondary opacity-50">
            {formatElapsed(elapsed)}
          </span>
        )}
      </div>
    </Reorder.Item>
  )
}
