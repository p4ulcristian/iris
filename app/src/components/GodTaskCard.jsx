import { useState, useEffect, useRef, useCallback } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import { useStore } from '../store'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowUpRightFromSquare, faCheck, faTriangleExclamation, faQuestion, faXmark, faTerminal, faGlobe, faClockRotateLeft, faGear, faSkull, faGripVertical } from '@fortawesome/free-solid-svg-icons'

// 3D Tilt hook - tracks mouse position and applies perspective transform
function use3DTilt(ref, maxRotation = 12) {
  const [transform, setTransform] = useState('')

  const handleMouseMove = useCallback((e) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const mouseX = e.clientX - centerX
    const mouseY = e.clientY - centerY
    // Normalize to -1 to 1 range
    const normalizedX = mouseX / (rect.width / 2)
    const normalizedY = mouseY / (rect.height / 2)
    // Clamp and invert for natural feel
    const rotateY = Math.max(-maxRotation, Math.min(maxRotation, normalizedX * maxRotation))
    const rotateX = Math.max(-maxRotation, Math.min(maxRotation, -normalizedY * maxRotation))
    setTransform(`perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`)
  }, [ref, maxRotation])

  const handleMouseLeave = useCallback(() => {
    setTransform('')
  }, [])

  return { transform, handleMouseMove, handleMouseLeave }
}

// Type icons
import claudeIcon from '../assets/icons/claude.png'
import linearIcon from '../assets/icons/linear.png'
import gitIcon from '../assets/icons/git.png'
import nvimIcon from '../assets/icons/nvim.png'
import browserIcon from '../assets/icons/browser.png'

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

// Get type icon component
function TypeIcon({ type }) {
  const iconClass = "w-4 h-4 object-contain"
  const faIconClass = "text-white/70"

  switch (type) {
    case 'god':
      return <img src={claudeIcon} alt="Claude" className={iconClass} />
    case 'linear':
      return <img src={linearIcon} alt="Linear" className={iconClass} />
    case 'git':
      return <img src={gitIcon} alt="Git" className={iconClass} />
    case 'nvim':
      return <img src={nvimIcon} alt="Nvim" className={iconClass} />
    case 'browser':
      return <img src={browserIcon} alt="Browser" className={iconClass} />
    case 'terminal':
      return <FontAwesomeIcon icon={faTerminal} className={faIconClass} size="sm" />
    case 'history':
      return <FontAwesomeIcon icon={faClockRotateLeft} className={faIconClass} size="sm" />
    case 'settings':
      return <FontAwesomeIcon icon={faGear} className={faIconClass} size="sm" />
    case 'cemetery':
      return <FontAwesomeIcon icon={faSkull} className={faIconClass} size="sm" />
    default:
      return <FontAwesomeIcon icon={faTerminal} className={faIconClass} size="sm" />
  }
}

export default function GodTaskCard({ entity, isActive, onClick, onClose, tabs, activeTabId, onMoveToTab, onMoveToNewTab }) {
  const { id, type, name, displayName, color, title, status, mission, readyState, spawnedAt } = entity
  const [elapsed, setElapsed] = useState(null)
  const [showMoveMenu, setShowMoveMenu] = useState(false)
  const [isSummoning, setIsSummoning] = useState(true)
  const moveMenuRef = useRef(null)
  const cardRef = useRef(null)
  const dragControls = useDragControls()

  // 3D tilt effect on hover
  const { transform: tiltTransform, handleMouseMove, handleMouseLeave } = use3DTilt(cardRef, 8)

  // Clear summon glow after animation completes
  useEffect(() => {
    const timer = setTimeout(() => setIsSummoning(false), 500)
    return () => clearTimeout(timer)
  }, [])

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

  return (
    <Reorder.Item
      value={entity}
      dragListener={false}
      dragControls={dragControls}
      onClick={onClick}
      className={`group relative w-full cursor-pointer overflow-hidden liquid-glass-god-tinted ${isSummoning ? 'summon-glow' : ''}`}
      style={{
        '--god-color': entityColor,
        '--god-color-rgb': hexToRgbCss(entityColor),
        borderRadius: '12px 16px 16px 12px',
        borderRight: `6px solid ${isActive ? entityColor : entityColor + '66'}`,
        opacity: isActive ? 1 : 0.5,
        filter: isActive ? 'none' : 'saturate(0.6)',
        transition: 'opacity 0.2s ease, border-color 0.2s ease, filter 0.2s ease'
      }}
      // Summon animation - divine arrival from above
      initial={{ opacity: 0, y: -40, scale: 0.9, filter: 'blur(8px)' }}
      animate={{
        opacity: isActive ? 1 : 0.5,
        y: 0,
        scale: 1,
        filter: isActive ? 'blur(0px)' : 'saturate(0.6) blur(0px)'
      }}
      // Banish animation - dissolve downward
      exit={{
        opacity: 0,
        y: 30,
        scale: 0.85,
        filter: 'blur(12px)',
        transition: { duration: 0.25, ease: 'easeIn' }
      }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 25,
        mass: 0.8
      }}
      layout
    >
      {/* Header row */}
      <div className="flex items-center h-8 px-3 gap-2">
        {/* Drag handle */}
        <div
          onPointerDown={(e) => dragControls.start(e)}
          className="w-5 h-5 flex items-center justify-center text-white/30 hover:text-white/70 cursor-grab active:cursor-grabbing transition-colors touch-none"
          title="Drag to reorder"
        >
          <FontAwesomeIcon icon={faGripVertical} size="sm" />
        </div>

        <TypeIcon type={type} />
        <span className="text-sm font-medium text-white truncate flex-1">
          {displayName || name}
        </span>

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
    </Reorder.Item>
  )
}
