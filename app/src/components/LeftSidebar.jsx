import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCircle,
  faKeyboard,
  faEarListen,
  faVolumeHigh,
  faCommentDots,
  faXmark,
  faPlus,
  faBrain,
  faScroll,
  faPaintBrush
} from '@fortawesome/free-solid-svg-icons'
import IconButton from './ui/IconButton'
import { REALM_COLORS } from '../themes'
import { CHRONICLE_URL } from '../config'

function Spinner() {
  return (
    <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
  )
}

function SystemTime() {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const hours = time.getHours().toString().padStart(2, '0')
  const minutes = time.getMinutes().toString().padStart(2, '0')

  return (
    <span className="text-white/20 text-[10px] font-mono mt-1">
      {hours}:{minutes}
    </span>
  )
}

function ChronicleButton() {
  const [open, setOpen] = useState(false)
  const [lines, setLines] = useState([])
  const [cursor, setCursor] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [status, setStatus] = useState({ running: false, volume: 0, start_time: null })

  const menuRef = useRef(null)
  const scrollRef = useRef(null)
  const loadMoreRef = useRef(null)
  const prevScrollHeight = useRef(0)

  // Fetch history with cursor-based pagination
  const fetchHistory = useCallback((reset = false) => {
    const params = new URLSearchParams({ count: '20', direction: 'before' })
    if (cursor && !reset) {
      params.set('cursor', cursor)
    }

    return fetch(`${CHRONICLE_URL}/chronicle/history?${params}`)
      .then(r => r.json())
      .then(data => {
        if (reset) {
          setLines(data.lines || [])
        } else {
          // Prepend older lines
          setLines(prev => [...(data.lines || []), ...prev])
        }
        setCursor(data.nextCursor)
        setHasMore(data.hasMore)
        return data
      })
      .catch(() => {
        if (reset) setLines([])
        setHasMore(false)
      })
  }, [cursor])

  // Initial load when opened
  useEffect(() => {
    if (!open) return

    setInitialLoading(true)
    setCursor(null)
    setHasMore(true)

    fetch(`${CHRONICLE_URL}/chronicle/history?count=20&direction=before`)
      .then(r => r.json())
      .then(data => {
        setLines(data.lines || [])
        setCursor(data.nextCursor)
        setHasMore(data.hasMore)
        setInitialLoading(false)

        // Scroll to bottom after initial load
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
          }
        }, 50)
      })
      .catch(() => {
        setLines([])
        setHasMore(false)
        setInitialLoading(false)
      })
  }, [open])

  // Poll for new entries and status
  useEffect(() => {
    if (!open || initialLoading) return

    const pollNew = () => {
      // Get newest line's timestamp
      const newestTs = lines.length > 0 ? lines[lines.length - 1]?.timestamp : null

      if (newestTs) {
        const params = new URLSearchParams({
          cursor: newestTs,
          count: '10',
          direction: 'after'
        })
        fetch(`${CHRONICLE_URL}/chronicle/history?${params}`)
          .then(r => r.json())
          .then(data => {
            if (data.lines?.length) {
              setLines(prev => [...prev, ...data.lines])
            }
          })
          .catch(() => {})
      }

      // Status for volume bar
      fetch(`${CHRONICLE_URL}/chronicle/status`)
        .then(r => r.json())
        .then(data => setStatus(data))
        .catch(() => {})
    }

    const interval = setInterval(pollNew, 1000)
    return () => clearInterval(interval)
  }, [open, initialLoading, lines])

  // IntersectionObserver for loading older entries when scrolling up
  useEffect(() => {
    if (!open || !loadMoreRef.current || loadingMore || !hasMore || initialLoading) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          // Save scroll height before loading
          if (scrollRef.current) {
            prevScrollHeight.current = scrollRef.current.scrollHeight
          }

          setLoadingMore(true)
          fetchHistory(false).finally(() => setLoadingMore(false))
        }
      },
      { threshold: 0.1, root: scrollRef.current }
    )

    observer.observe(loadMoreRef.current)
    return () => observer.disconnect()
  }, [open, loadingMore, hasMore, initialLoading, fetchHistory])

  // Preserve scroll position when prepending content
  useEffect(() => {
    if (scrollRef.current && prevScrollHeight.current > 0 && !initialLoading) {
      const newScrollHeight = scrollRef.current.scrollHeight
      const scrollDiff = newScrollHeight - prevScrollHeight.current
      if (scrollDiff > 0) {
        scrollRef.current.scrollTop += scrollDiff
      }
      prevScrollHeight.current = 0
    }
  }, [lines, initialLoading])

  // Format elapsed time
  const formatTime = (startTime) => {
    if (!startTime) return '00:00'
    const elapsed = Math.floor(Date.now() / 1000 - startTime)
    const mins = Math.floor(elapsed / 60)
    const secs = elapsed % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Format relative time
  const formatRelativeTime = (timestamp) => {
    const now = new Date()
    const ts = new Date(timestamp)
    const diff = Math.floor((now - ts) / 1000)

    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return ts.toLocaleDateString()
  }

  // Group lines by day
  const groupByDay = (lines) => {
    const groups = {}
    for (const line of lines) {
      const day = line.timestamp.split('T')[0]
      if (!groups[day]) groups[day] = []
      groups[day].push(line)
    }
    return groups
  }

  // Format day header
  const formatDayHeader = (dateStr) => {
    const date = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (dateStr === today.toISOString().split('T')[0]) return 'Today'
    if (dateStr === yesterday.toISOString().split('T')[0]) return 'Yesterday'
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const grouped = groupByDay(lines)
  const days = Object.keys(grouped).sort()  // oldest first (top)

  return (
    <div className="relative" ref={menuRef}>
      <IconButton
        icon={faScroll}
        size="md"
        variant="glass"
        onClick={() => setOpen(!open)}
        title="Chronicle preview"
      />
      {open && (
        <div className="absolute left-full bottom-0 ml-2 w-[400px] max-h-[60vh] liquid-glass-popup flex flex-col z-50">
          {/* Scrollable content */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-3 min-h-[200px] max-h-[calc(60vh-60px)]"
          >
            {/* Load more sentinel at top */}
            {hasMore && !initialLoading && (
              <div ref={loadMoreRef} className="py-2 text-center">
                {loadingMore && <Spinner />}
              </div>
            )}

            {initialLoading ? (
              <div className="flex justify-center items-center py-8">
                <Spinner />
              </div>
            ) : lines.length === 0 ? (
              <p className="text-white/40 text-xs text-center py-4">No transcripts yet</p>
            ) : (
              <div className="space-y-3">
                {days.map(day => (
                  <div key={day}>
                    <div className="sticky top-0 text-[10px] text-white/40 py-1 bg-inherit backdrop-blur-sm z-10">
                      {formatDayHeader(day)}
                    </div>
                    <ul className="space-y-1.5">
                      {grouped[day].map((line, i) => (
                        <li
                          key={`${line.timestamp}-${i}`}
                          className={`text-xs ${line.source === 'input' ? 'text-blue-300/80' : 'text-white/60'}`}
                          title={new Date(line.timestamp).toLocaleTimeString()}
                        >
                          <span className="text-white/30 mr-1.5">
                            {new Date(line.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {line.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Volume bar and timer - always visible footer */}
          <div className="flex items-center gap-3 p-3 border-t border-white/10">
            <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden relative">
              <div
                className="h-full bg-green-500 transition-all duration-100"
                style={{ width: `${(status.volume || 0) * 100}%` }}
              />
              <div
                className="absolute top-0 h-full w-0.5 bg-yellow-400 transition-all duration-100"
                style={{ left: `${(status.vad || 0) * 100}%` }}
              />
            </div>
            <span className="text-xs text-white/50 font-mono min-w-[40px]">
              {formatTime(status.batch_start)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function ServicesDropdown({ connected, services, servicesLoading, onToggle }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  // Close menu when clicking outside
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const serviceList = [
    { name: 'Wake', key: 'wake', icon: faKeyboard },
    { name: 'Hear', key: 'hear', icon: faEarListen },
    { name: 'Chronicle', key: 'chronicle', icon: faScroll, parent: 'hear' },
    { name: 'Speak', key: 'speak', icon: faVolumeHigh },
    { name: 'Express', key: 'express', icon: faCommentDots },
    { name: 'Draw', key: 'draw', icon: faPaintBrush },
    { name: 'Ollama', key: 'ollama', icon: faBrain },
  ]

  const activeCount = serviceList.filter(s => services[s.key]).length

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="btn btn-glass btn-icon btn-icon-md"
        title={`Services (${activeCount}/${serviceList.length})`}
      >
        <FontAwesomeIcon
          icon={faCircle}
          className={`text-[8px] ${connected ? 'text-green-500' : 'text-red-500'}`}
        />
      </button>

      {open && (
        <div className="absolute left-full bottom-0 ml-2 min-w-[160px] liquid-glass-popup py-1.5 z-50">
          {serviceList.map((service) => {
            const isActive = services[service.key]
            const isLoading = servicesLoading[service.key]
            const hasParent = service.parent
            const parentActive = hasParent ? services[service.parent] : true
            const isDisabled = isLoading || (hasParent && !parentActive)

            return (
              <button
                key={service.key}
                onClick={() => !isDisabled && onToggle(service.key, isActive)}
                disabled={isDisabled}
                className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2.5 transition-all rounded-lg mx-auto ${
                  isDisabled && !isLoading
                    ? 'text-white/20 cursor-not-allowed'
                    : isLoading
                      ? 'text-yellow-400 cursor-wait'
                      : isActive
                        ? 'liquid-glass-text hover:bg-white/10'
                        : 'liquid-glass-text-muted hover:bg-white/10'
                }`}
                style={{
                  width: 'calc(100% - 8px)',
                  marginLeft: hasParent ? '16px' : '4px',
                  paddingLeft: hasParent ? '8px' : undefined
                }}
              >
                {isLoading ? (
                  <Spinner />
                ) : (
                  <FontAwesomeIcon
                    icon={service.icon}
                    className={`text-[10px] w-3 ${isActive ? 'text-green-400' : 'opacity-50'}`}
                  />
                )}
                <span className={isActive ? '' : isLoading ? '' : 'opacity-60'}>{service.name}</span>
                {isActive && !isLoading && <span className="ml-auto text-green-400 text-[10px]">●</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function LeftSidebar({
  connected,
  send,
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onTabNew,
  getEntitiesForTab
}) {
  const services = useStore(s => s.services)
  const servicesLoading = useStore(s => s.servicesLoading)
  const setServiceLoading = useStore(s => s.setServiceLoading)
  const powers = useStore(s => s.settings?.powers ?? true)
  const loadStage = useStore(s => s.loadStage)
  const initialLoadDone = useStore(s => s.initialLoadDone)
  const version = useStore(s => s.version)

  const handleServiceToggle = (service, isActive) => {
    console.log('handleServiceToggle called:', { service, isActive, hasSend: !!send })
    if (!send) {
      console.error('send function is not available!')
      return
    }

    if (!isActive) {
      // Starting a service - set loading state
      setServiceLoading(service, true)

      // Timeout after 15 seconds if service doesn't start
      setTimeout(() => {
        setServiceLoading(service, false)
      }, 15000)
    }

    const msg = {
      event: isActive ? 'service:stop' : 'service:start',
      service
    }
    console.log('Sending:', msg)
    send(msg)
  }

  return (
    <aside className="flex flex-col items-center w-fit liquid-glass-light gap-1 z-20 overflow-visible pl-3 pr-3">
      {/* Tabs */}
      <div className="flex flex-col items-center gap-1 overflow-visible">
        <AnimatePresence>
          {tabs?.map((tab, idx) => {
            const isActive = activeTabId === tab.id
            const realmColor = REALM_COLORS[tab.name] || '#888888'
            // Stagger delay: only on initial load when loadStage >= 2
            const staggerDelay = (!initialLoadDone || loadStage < 5) ? idx * 0.05 : 0

            return (
              <motion.button
                key={tab.id}
                onClick={() => onTabSelect(tab.id)}
                className={`
                  group relative btn btn-icon btn-icon-md
                  ${isActive
                    ? 'btn-glass'
                    : 'btn-ghost'
                  }
                `}
                title={`${tab.name} (Alt+${idx + 1})`}
                initial={{ opacity: 0, x: -20, scale: 0.8 }}
                animate={{
                  opacity: loadStage >= 2 ? 1 : 0,
                  x: loadStage >= 2 ? 0 : -20,
                  scale: loadStage >= 2 ? 1 : 0.8
                }}
                exit={{ opacity: 0, x: -20, scale: 0.8 }}
                transition={{
                  type: 'spring',
                  stiffness: 400,
                  damping: 25,
                  delay: staggerDelay
                }}
              >
                <FontAwesomeIcon
                  icon={faCircle}
                  style={{ color: realmColor }}
                  className={`text-[10px] ${isActive ? '' : 'opacity-50'}`}
                />
                {tabs.length > 1 && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation()
                      onTabClose(tab.id)
                    }}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center scale-0 group-hover:scale-100 bg-white/10 backdrop-blur-md hover:bg-red-500/60 text-white/60 hover:text-white rounded-full transition-all duration-200 cursor-pointer text-[8px] border border-white/10 hover:border-red-400/30"
                  >
                    <FontAwesomeIcon icon={faXmark} />
                  </span>
                )}
              </motion.button>
            )
          })}
        </AnimatePresence>

        {/* Add tab button */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{
            opacity: loadStage >= 2 ? 1 : 0,
            scale: loadStage >= 2 ? 1 : 0.8
          }}
          transition={{
            type: 'spring',
            stiffness: 400,
            damping: 25,
            delay: (!initialLoadDone || loadStage < 5) ? (tabs?.length || 0) * 0.05 : 0
          }}
        >
          <IconButton
            icon={faPlus}
            size="md"
            variant="ghost"
            onClick={onTabNew}
            title="New tab (Alt+N)"
          />
        </motion.div>
      </div>

      {/* IRIS branding */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {'IRIS'.split('').map((letter, i) => (
          <span key={i} className="text-white/50 text-lg font-mono font-bold leading-tight">{letter}</span>
        ))}
        {version && (
          <span className="text-white/30 text-[10px] font-mono mt-2">{version}</span>
        )}
        <SystemTime />
      </div>

      {/* Chronicle preview button - above Powers */}
      {powers && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{
            opacity: loadStage >= 2 ? 1 : 0,
            scale: loadStage >= 2 ? 1 : 0.8
          }}
          transition={{
            type: 'spring',
            stiffness: 400,
            damping: 25,
            delay: (!initialLoadDone || loadStage < 5) ? 0.12 : 0
          }}
        >
          <ChronicleButton />
        </motion.div>
      )}

      {/* Services dropdown - only show when powers are enabled */}
      {powers && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{
            opacity: loadStage >= 2 ? 1 : 0,
            scale: loadStage >= 2 ? 1 : 0.8
          }}
          transition={{
            type: 'spring',
            stiffness: 400,
            damping: 25,
            delay: (!initialLoadDone || loadStage < 5) ? 0.15 : 0
          }}
        >
          <ServicesDropdown
            connected={connected}
            services={services}
            servicesLoading={servicesLoading}
            onToggle={handleServiceToggle}
          />
        </motion.div>
      )}
    </aside>
  )
}
