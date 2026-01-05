import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../store'
import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowUpRightFromSquare, faArrowRightFromBracket, faCheck, faTriangleExclamation, faQuestion, faXmark } from '@fortawesome/free-solid-svg-icons'
import { EntityIcon } from '../entities'

// Convert hex to RGB for CSS (comma-separated)
function hexToRgbCss(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return '128, 128, 128'
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
}

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


export default function EntityCard({ entity, isActive, onClick, onClose, onSplit, tabs, activeTabId, onMoveToTab, onMoveToNewTab, staggerIndex = 0, disableAnimation = false }) {
  const { id, type, name, displayName, color, title, status, mission, readyState, spawnedAt } = entity
  const loadStage = useStore(s => s.loadStage)
  const initialLoadDone = useStore(s => s.initialLoadDone)
  const isAltHeld = useStore(s => s.isAltHeld)

  const [elapsed, setElapsed] = useState(null)
  const [showMoveMenu, setShowMoveMenu] = useState(false)
  const [isSummoning, setIsSummoning] = useState(true)
  const [isTileDragging, setIsTileDragging] = useState(false)
  const moveMenuRef = useRef(null)
  const cardRef = useRef(null)

  // Clear summon glow after animation completes
  useEffect(() => {
    const timer = setTimeout(() => setIsSummoning(false), 500)
    return () => clearTimeout(timer)
  }, [])

  // Setup pragmatic drag for entire card (tile-level drag)
  useEffect(() => {
    const el = cardRef.current
    if (!el) return

    const cleanup = draggable({
      element: el,
      getInitialData: () => ({
        source: 'move',
        entityId: id,
        entityType: type
      }),
      onDragStart: () => setIsTileDragging(true),
      onDrop: () => setIsTileDragging(false)
    })

    return () => cleanup()
  }, [id, type])

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

  // Get entity color - theme color for gods, custom color for others
  const godColors = useStore(s => s.godColors)
  const entityColor = type === 'god'
    ? (godColors[name?.toLowerCase()] || color || '#888')
    : (color || '#888')

  // Title: the goal (set via focus skill) or initial mission
  const displayTitle = title || mission
  // Status: current action from hook (only show if different from title)
  const displayStatus = status && status !== displayTitle ? status : null

  // Get status pill config for ready state
  const getStatusPill = () => {
    switch (readyState) {
      case 'done': return { icon: faCheck, label: 'done', className: 'liquid-glass-pill-done' }
      case 'stuck': return { icon: faTriangleExclamation, label: 'stuck', className: 'liquid-glass-pill-stuck' }
      case 'question': return { icon: faQuestion, label: 'question', className: 'liquid-glass-pill-question' }
      default: return null
    }
  }
  const statusPill = getStatusPill()

  // Calculate stagger delay: only apply on initial load before stage 5
  const staggerDelay = (!initialLoadDone || loadStage < 5) ? staggerIndex * 0.08 : 0
  // Should be visible based on load stage (entities appear at stage 4)
  const shouldShow = loadStage >= 4

  return (
    <motion.div
      className={`group relative overflow-hidden ${isSummoning ? 'summon-glow' : ''}`}
      style={{ borderRadius: '12px 16px 16px 12px' }}
      initial={disableAnimation ? false : { opacity: 0, y: -40, scale: 0.9, filter: 'blur(8px)' }}
      animate={disableAnimation ? {
        opacity: isActive ? 1 : 0.6,
        filter: isActive ? 'blur(0px)' : 'saturate(0.7) blur(0px)',
      } : {
        opacity: shouldShow ? (isActive ? 1 : 0.6) : 0,
        y: shouldShow ? 0 : -40,
        scale: shouldShow ? 1 : 0.9,
        filter: shouldShow ? (isActive ? 'blur(0px)' : 'saturate(0.7) blur(0px)') : 'blur(8px)',
      }}
      exit={disableAnimation ? undefined : {
        opacity: 0,
        y: 30,
        scale: 0.85,
        filter: 'blur(12px)',
        transition: { duration: 0.15, ease: 'easeIn' }
      }}
      transition={disableAnimation ? { duration: 0.2 } : {
        type: 'spring',
        stiffness: 400,
        damping: 25,
        mass: 0.8,
        delay: staggerDelay,
      }}
      layout={disableAnimation ? false : "position"}
    >
      {/* Draggable card wrapper for tile splitting */}
      <div
        ref={cardRef}
        onClick={() => !isAltHeld && onClick()}
        className={`liquid-glass-god-tinted cursor-grab active:cursor-grabbing ${isTileDragging ? 'opacity-50' : ''}`}
        style={{
          '--god-color': entityColor,
          '--god-color-rgb': hexToRgbCss(entityColor),
          borderRadius: '12px 16px 16px 12px',
          borderRight: `6px solid ${isActive ? entityColor : entityColor + '66'}`,
        }}
      >
      {/* Header row */}
      <div className="flex items-center h-8 px-3 gap-2">
        {/* Type icon */}
        <EntityIcon type={type} />
        <span className="text-sm font-medium text-white truncate flex-1">
          {displayName || name}
        </span>

        {/* Split out of group button */}
        {onSplit && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onSplit()
            }}
            className="w-6 h-6 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 rounded transition-all cursor-pointer"
            title="Split to new stage"
          >
            <FontAwesomeIcon icon={faArrowRightFromBracket} size="xs" />
          </button>
        )}

        {/* Move to tab button */}
        <div className="relative" ref={moveMenuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowMoveMenu(!showMoveMenu)
            }}
            className="w-6 h-6 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 rounded transition-all cursor-pointer"
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
                        onMoveToTab?.(id, tab.id)
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
                  onMoveToNewTab?.(id)
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
          className="w-6 h-6 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 rounded transition-all cursor-pointer"
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
        {/* Pills row - status & time */}
        {(statusPill || elapsed !== null) && (
          <div className="flex items-center justify-between mt-2 gap-2">
            {/* Status pill */}
            {statusPill && (
              <span className={`liquid-glass-pill ${statusPill.className}`}>
                <FontAwesomeIcon icon={statusPill.icon} size="xs" />
                {statusPill.label}
              </span>
            )}
            <div className="flex-1" />
            {/* Time pill */}
            {elapsed !== null && (
              <span className="liquid-glass-pill text-white/70 font-mono">
                {formatElapsed(elapsed)}
              </span>
            )}
          </div>
        )}
      </div>
      </div>
    </motion.div>
  )
}
