import { useState, useEffect, useRef } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import { useStore } from '../store'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowUpRightFromSquare, faCheck, faTriangleExclamation, faQuestion, faXmark } from '@fortawesome/free-solid-svg-icons'

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

export default function GodTaskCard({ god, isActive, onClick, onClose, tabs, activeTabId, onMoveToTab, onMoveToNewTab }) {
  const { name, displayName, color, title, status, mission, readyState, spawnedAt } = god
  const [elapsed, setElapsed] = useState(null)
  const [showMoveMenu, setShowMoveMenu] = useState(false)
  const moveMenuRef = useRef(null)
  const dragControls = useDragControls()

  // Get other tabs (tabs we can move to)
  const otherTabs = tabs?.filter(t => t.id !== activeTabId) || []

  // Close move menu when clicking outside
  useEffect(() => {
    if (!showMoveMenu) return
    const handleClickOutside = (e) => {
      if (moveMenuRef.current && !moveMenuRef.current.contains(e.target)) {
        setShowMoveMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMoveMenu])

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

  // Get status icon for ready state
  const getStatusIcon = () => {
    switch (readyState) {
      case 'done': return faCheck
      case 'stuck': return faTriangleExclamation
      case 'question': return faQuestion
      default: return null
    }
  }
  const statusIcon = getStatusIcon()

  return (
    <Reorder.Item
      value={god}
      dragListener={true}
      dragControls={dragControls}
      onClick={onClick}
      className="group relative w-full rounded-lg cursor-grab active:cursor-grabbing overflow-hidden backdrop-blur-xl"
      style={{
        '--god-color': godColor,
        '--god-color-alpha': `${godColor}88`,
        background: 'rgba(10, 10, 15, 0.5)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderLeft: `3px solid ${godColor}`,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)'
      }}
      initial={false}
    >
      {/* Header row */}
      <div className="flex items-center h-8 px-3">
        <span className="text-sm font-medium text-white truncate flex-1">
          {displayName || name}
        </span>
        {statusIcon && (
          <div className="w-6 h-6 flex items-center justify-center text-white/70">
            <FontAwesomeIcon icon={statusIcon} size="xs" />
          </div>
        )}

        {/* Move to tab button */}
        <div className="relative" ref={moveMenuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowMoveMenu(!showMoveMenu)
            }}
            className="w-6 h-6 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 rounded transition-all"
            title="Move to tab"
          >
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} size="xs" />
          </button>

          {/* Dropdown menu */}
          {showMoveMenu && (
            <div className="absolute right-0 top-6 z-50 min-w-[140px] bg-bg-secondary border border-border rounded shadow-lg py-1">
              {otherTabs.length > 0 && (
                <>
                  {otherTabs.map((tab, idx) => (
                    <button
                      key={tab.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        onMoveToTab?.(name, tab.id)
                        setShowMoveMenu(false)
                      }}
                      className="w-full px-3 py-1.5 text-left text-sm text-text-primary hover:bg-bg-tertiary flex items-center gap-2"
                    >
                      <span className="text-xs text-text-secondary opacity-60">{idx + 1}</span>
                      <span>{tab.name}</span>
                    </button>
                  ))}
                  <div className="border-t border-border my-1" />
                </>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onMoveToNewTab?.(name)
                  setShowMoveMenu(false)
                }}
                className="w-full px-3 py-1.5 text-left text-sm text-text-primary hover:bg-bg-tertiary flex items-center gap-2"
              >
                <span className="text-xs text-text-secondary opacity-60">+</span>
                <span>New Tab</span>
              </button>
            </div>
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="w-6 h-6 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 rounded transition-all"
          title="Banish"
        >
          <FontAwesomeIcon icon={faXmark} size="xs" />
        </button>
      </div>

      {/* Content */}
      <div className="px-3 pb-2">
        {/* Title (goal) */}
        {displayTitle && (
          <span className="text-sm block font-medium text-white/90">
            {displayTitle}
          </span>
        )}
        {/* Status (current action) */}
        {displayStatus && (
          <span className="text-xs mt-0.5 block text-white/60">
            {displayStatus}
          </span>
        )}
        {/* Elapsed time */}
        {elapsed !== null && (
          <span className="text-xs font-mono mt-1 block text-right text-white/50">
            {formatElapsed(elapsed)}
          </span>
        )}
      </div>
    </Reorder.Item>
  )
}
