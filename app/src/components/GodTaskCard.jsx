import { useState, useEffect } from 'react'
import { Reorder, useDragControls, motion, AnimatePresence } from 'framer-motion'
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
  const { name, displayName, color, status, mission, readyState, spawnedAt } = god
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

  // Show status if god has updated it via focus skill, otherwise show mission
  // Default status is 'working' which we don't want to show initially
  const displayText = (status && status !== 'working') ? status : mission

  // Get CSS class for ready state
  const getReadyClass = () => {
    switch (readyState) {
      case 'working': return 'task-working'
      case 'done': return 'task-done'
      case 'stuck': return 'task-stuck'
      default: return 'task-working'
    }
  }

  // Invert colors when active: solid god color bg, dark text
  const bgColor = isActive ? godColor : 'rgba(0, 0, 0, 0.4)'
  const textColor = isActive ? '#111' : godColor
  const subtextColor = isActive ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)'
  const mutedColor = isActive ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)'

  return (
    <Reorder.Item
      value={god}
      dragListener={true}
      dragControls={dragControls}
      onClick={onClick}
      className={`group relative w-full rounded-xl cursor-grab active:cursor-grabbing backdrop-blur-md border ${getReadyClass()}`}
      style={{
        '--god-color': godColor,
        '--god-color-alpha': `${godColor}88`
      }}
      initial={false}
      animate={{
        scale: isActive ? 1.02 : 1,
        y: isActive ? -2 : 0,
        backgroundColor: bgColor,
        borderColor: isActive ? godColor : `${godColor}66`,
        boxShadow: isActive
          ? `0 0 30px ${godColor}66, inset 0 0 20px rgba(255,255,255,0.1)`
          : `0 0 20px ${godColor}22, inset 0 0 30px ${godColor}11`
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
        y: { type: 'spring', stiffness: 500, damping: 30 },
        backgroundColor: { duration: 0.3, ease: 'easeOut' },
        borderColor: { duration: 0.3, ease: 'easeOut' },
        boxShadow: { duration: 0.3, ease: 'easeOut' }
      }}
    >
      <div className="px-4 py-3">
        {/* Top row: name + close button */}
        <div className="flex items-start justify-between">
          <motion.span
            className="text-lg font-semibold truncate"
            initial={false}
            animate={{ color: textColor }}
            transition={{ duration: 0.3 }}
          >
            {displayName || name}
          </motion.span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="absolute -top-2 -right-2 w-8 h-8 flex items-center justify-center rounded-full transition-all cursor-pointer hover:scale-110 text-lg font-bold border-2"
          style={{
            backgroundColor: godColor,
            color: '#111',
            borderColor: '#111'
          }}
          title="Banish"
        >
          ×
        </button>
        {/* Row 2: status */}
        {displayText && (
          <motion.span
            className="text-sm mt-1 block"
            initial={false}
            animate={{ color: subtextColor }}
            transition={{ duration: 0.3 }}
          >
            {displayText}
          </motion.span>
        )}
        {/* Row 3: elapsed time */}
        {elapsed !== null && (
          <motion.span
            className="text-xs font-mono mt-1 block text-right"
            initial={false}
            animate={{ color: mutedColor }}
            transition={{ duration: 0.3 }}
          >
            {formatElapsed(elapsed)}
          </motion.span>
        )}
      </div>
    </Reorder.Item>
  )
}
