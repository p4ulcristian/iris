import { useRef, useLayoutEffect, useState, useEffect } from 'react'
import { animate, SPRING_EASING, SPRING_DURATION, FAST_DURATION } from '../utils/waapi'

const STATUS_ICONS = {
  working: '▶',
  done: '✦',
  stuck: '⚠',
  scattered: '⚡'
}

// Animated tab button with enter/exit animations
function AnimatedTabButton({ god, isActive, onSelect, onClose, isExiting, onExitComplete }) {
  const ref = useRef(null)
  const animRef = useRef(null)
  const prevActiveRef = useRef(isActive)

  // Enter animation
  useLayoutEffect(() => {
    if (!ref.current || isExiting) return

    animRef.current = animate(ref.current,
      [
        { opacity: 0, transform: 'translateX(20px) scale(0.9)' },
        { opacity: 1, transform: 'translateX(0) scale(1)' }
      ],
      { duration: SPRING_DURATION, easing: SPRING_EASING }
    )

    return () => {
      if (animRef.current) {
        try { animRef.current.cancel() } catch (e) {}
      }
    }
  }, [])

  // Active state change animation (bidirectional)
  useLayoutEffect(() => {
    if (!ref.current || prevActiveRef.current === isActive) {
      prevActiveRef.current = isActive
      return
    }
    prevActiveRef.current = isActive

    animate(ref.current,
      isActive
        ? [{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }]
        : [{ transform: 'scale(1)' }, { transform: 'scale(0.97)' }, { transform: 'scale(1)' }],
      { duration: 200, easing: 'ease-out' }
    )
  }, [isActive])

  // Exit animation
  useEffect(() => {
    if (!isExiting || !ref.current) return

    const exitAnim = animate(ref.current,
      [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(0.8)' }
      ],
      { duration: FAST_DURATION, easing: 'ease-out' }
    )

    exitAnim?.finished.then(onExitComplete).catch(onExitComplete)
  }, [isExiting, onExitComplete])

  return (
    <button
      ref={ref}
      onClick={() => onSelect(god.name)}
      className={`
        flex items-center gap-2 h-8 px-3
        bg-bg-tertiary border border-border rounded-md
        text-sm cursor-pointer transition-all duration-200
        hover:bg-[#222] hover:border-[#333]
        ${isActive ? 'bg-bg-primary text-text-primary' : 'text-text-secondary'}
      `}
      style={{
        borderColor: isActive ? god.color : undefined,
        boxShadow: isActive ? `0 0 12px ${god.color}33` : undefined,
        opacity: 0 // Initial state before animation
      }}
    >
      <span className="text-[10px]" style={{ color: god.color }}>●</span>
      <span>{god.name}</span>
      <span className={`text-[10px] opacity-70 ${god.readyState === 'done' ? 'text-green-500' : god.readyState === 'stuck' ? 'text-red-500' : god.readyState === 'scattered' ? 'text-red-500' : ''}`}>
        {STATUS_ICONS[god.readyState] || '▶'}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose(god.name)
        }}
        className="w-4 h-4 flex items-center justify-center text-text-secondary text-sm opacity-0 hover:opacity-100 hover:bg-white/10 hover:text-red-500 rounded transition-all group-hover:opacity-100 cursor-pointer"
        title="Banish"
      >
        ×
      </button>
    </button>
  )
}

export default function GodTabs({ gods, activeGod, onSelect, onClose, onSummon, connected }) {
  // Track which gods are exiting for exit animations
  const [exitingGods, setExitingGods] = useState(new Set())
  const prevGodsRef = useRef(gods)

  // Detect removed gods and trigger exit animations
  useEffect(() => {
    const prevGodNames = new Set(prevGodsRef.current.map(g => g.name))
    const currentGodNames = new Set(gods.map(g => g.name))

    // Find gods that were removed
    const removed = [...prevGodNames].filter(name => !currentGodNames.has(name))

    if (removed.length > 0) {
      setExitingGods(prev => new Set([...prev, ...removed]))
    }

    prevGodsRef.current = gods
  }, [gods])

  const handleExitComplete = (godName) => {
    setExitingGods(prev => {
      const next = new Set(prev)
      next.delete(godName)
      return next
    })
  }

  // Combine current gods with exiting gods (for exit animation)
  const allGods = [
    ...gods,
    ...prevGodsRef.current.filter(g => exitingGods.has(g.name) && !gods.find(cg => cg.name === g.name))
  ]

  return (
    <nav className="flex items-center gap-1 h-11 px-3 bg-bg-secondary border-b border-border overflow-x-auto">
      {allGods.map(god => (
        <AnimatedTabButton
          key={god.name}
          god={god}
          isActive={activeGod === god.name}
          onSelect={onSelect}
          onClose={onClose}
          isExiting={exitingGods.has(god.name)}
          onExitComplete={() => handleExitComplete(god.name)}
        />
      ))}

      {/* Summon button - CSS handles hover/active states */}
      <button
        onClick={onSummon}
        disabled={!connected}
        className={`
          h-8 px-4 rounded-md text-sm font-medium transition-all
          hover:scale-[1.02] hover:-translate-y-px
          active:scale-[0.98]
          ${connected
            ? 'bg-accent text-white hover:bg-[#5a62e0]'
            : 'bg-bg-tertiary text-text-secondary cursor-not-allowed'
          }
        `}
      >
        + Summon
      </button>
    </nav>
  )
}
