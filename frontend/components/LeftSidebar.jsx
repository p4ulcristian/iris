import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCircle,
  faEarListen,
  faVolumeHigh,
  faXmark,
  faPlus,
  faScroll,
  faEye,
  faPlug,
  faTerminal,
  faTrash
} from '@fortawesome/free-solid-svg-icons'
import IconButton from './ui/IconButton'
import DraggableTypeButton from './DraggableTypeButton'
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

  // Get chronicle status from store (pushed via WebSocket)
  const chronicleDetails = useStore(state => state.chronicleDetails)
  const status = chronicleDetails || { running: false, volume: 0, start_time: null }

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

  // Listen for new transcript lines via WebSocket (pushed from server)
  useEffect(() => {
    if (!open) return

    const handleNewLine = (event) => {
      const line = event.detail
      if (line) {
        setLines(prev => [...prev, line])
      }
    }

    window.addEventListener('iris:chronicle:line', handleNewLine)
    return () => window.removeEventListener('iris:chronicle:line', handleNewLine)
  }, [open])

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

function LogsButton({ send }) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('backend')
  const [lines, setLines] = useState({ backend: [], frontend: [] })
  const [loading, setLoading] = useState(false)
  const menuRef = useRef(null)
  const scrollRef = useRef(null)
  const wasAtBottomRef = useRef(true)

  // Fetch logs
  const fetchLogs = useCallback((type) => {
    if (!send) return
    send({ event: 'logs:read', type, lines: 200 })
  }, [send])

  // Listen for log data via global WebSocket message listeners
  useEffect(() => {
    if (!open) return

    const handleMessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.event === 'logs:data') {
          // Check if we're at bottom before updating
          if (scrollRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
            wasAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 50
          }

          setLines(prev => ({ ...prev, [msg.type]: msg.lines || [] }))
          setLoading(false)

          // Auto-scroll to bottom only if we were already at bottom
          if (wasAtBottomRef.current) {
            setTimeout(() => {
              if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight
              }
            }, 50)
          }
        } else if (msg.event === 'logs:cleared') {
          setLines(prev => ({ ...prev, [msg.type]: [] }))
        }
      } catch {}
    }

    // Subscribe to global WebSocket message listeners
    const messageListeners = window.__irisWsMessageListeners
    if (messageListeners) {
      messageListeners.add(handleMessage)
      return () => messageListeners.delete(handleMessage)
    }
  }, [open])

  // Initial load and polling when open
  useEffect(() => {
    if (!open) return

    setLoading(true)
    fetchLogs(activeTab)

    const interval = setInterval(() => {
      fetchLogs(activeTab)
    }, 1000) // Poll every second for real-time updates

    return () => clearInterval(interval)
  }, [open, activeTab, fetchLogs])

  // Handle clear
  const handleClear = () => {
    if (!send) return
    send({ event: 'logs:clear', type: activeTab })
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

  const currentLines = lines[activeTab] || []

  // Parse log line to extract level
  const getLineLevel = (line) => {
    if (line.includes('ERROR')) return 'error'
    if (line.includes('WARN')) return 'warn'
    return 'info'
  }

  return (
    <div className="relative" ref={menuRef}>
      <IconButton
        icon={faTerminal}
        size="md"
        variant="glass"
        onClick={() => setOpen(!open)}
        title="System logs"
      />
      {open && (
        <div className="absolute left-full bottom-0 ml-2 w-[500px] max-h-[70vh] liquid-glass-popup flex flex-col z-50">
          {/* Tabs */}
          <div className="flex border-b border-white/10">
            <button
              onClick={() => setActiveTab('backend')}
              className={`flex-1 px-4 py-2 text-xs font-medium transition-all ${
                activeTab === 'backend'
                  ? 'text-white border-b-2 border-blue-400'
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              Backend
            </button>
            <button
              onClick={() => setActiveTab('frontend')}
              className={`flex-1 px-4 py-2 text-xs font-medium transition-all ${
                activeTab === 'frontend'
                  ? 'text-white border-b-2 border-green-400'
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              Frontend
            </button>
          </div>

          {/* Log content */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-3 min-h-[300px] max-h-[calc(70vh-80px)] font-mono text-[10px]"
          >
            {loading && currentLines.length === 0 ? (
              <div className="flex justify-center items-center py-8">
                <Spinner />
              </div>
            ) : currentLines.length === 0 ? (
              <p className="text-white/40 text-xs text-center py-4">No logs yet</p>
            ) : (
              <div className="space-y-0.5">
                {currentLines.map((line, i) => {
                  const level = getLineLevel(line)
                  return (
                    <div
                      key={i}
                      className={`whitespace-pre-wrap break-all ${
                        level === 'error' ? 'text-red-400' :
                        level === 'warn' ? 'text-yellow-400' :
                        'text-white/60'
                      }`}
                    >
                      {line}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-2 border-t border-white/10">
            <span className="text-[10px] text-white/40">
              {currentLines.length} lines
            </span>
            <button
              onClick={handleClear}
              className="px-2 py-1 text-[10px] text-white/50 hover:text-white/80 hover:bg-white/10 rounded transition-all flex items-center gap-1"
            >
              <FontAwesomeIcon icon={faTrash} className="text-[8px]" />
              Clear
            </button>
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
    { name: 'MCP', key: 'mcp', icon: faPlug, readOnly: true },
    { name: 'Hear', key: 'hear', icon: faEarListen },
    { name: 'Chronicle', key: 'chronicle', icon: faScroll, parent: 'hear' },
    { name: 'Speak', key: 'speak', icon: faVolumeHigh },
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
            const isReadOnly = service.readOnly
            const isDisabled = isLoading || (hasParent && !parentActive) || isReadOnly

            return (
              <button
                key={service.key}
                onClick={() => !isDisabled && onToggle(service.key, isActive)}
                disabled={isDisabled}
                className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2.5 transition-all rounded-lg mx-auto ${
                  isReadOnly
                    ? isActive
                      ? 'liquid-glass-text cursor-default'
                      : 'liquid-glass-text-muted cursor-default'
                    : isDisabled && !isLoading
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
                    className={`text-[10px] w-3 ${isActive ? 'text-green-400' : isReadOnly && !isActive ? 'text-red-400' : 'opacity-50'}`}
                  />
                )}
                <span className={isActive ? '' : isLoading ? '' : 'opacity-60'}>{service.name}</span>
                {isActive && !isLoading && <span className="ml-auto text-green-400 text-[10px]">●</span>}
                {isReadOnly && !isActive && !isLoading && <span className="ml-auto text-red-400 text-[10px]">●</span>}
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
  getEntitiesForTab,
  // Eye menu props
  sidebarCollapsed,
  sidebarButtonsExpanded,
  setSidebarButtonsExpanded,
  onSidebarToggle,
  onSpawnEntity,
  onOpenSummonModal,
}) {
  const services = useStore(s => s.services)
  const servicesLoading = useStore(s => s.servicesLoading)
  const setServiceLoading = useStore(s => s.setServiceLoading)
  const powers = useStore(s => s.settings?.powers ?? true)
  const loadStage = useStore(s => s.loadStage)
  const initialLoadDone = useStore(s => s.initialLoadDone)
  const version = useStore(s => s.version)

  const handleServiceToggle = (service, isActive) => {
    if (!send) return

    // Target state is the opposite of current (start -> true, stop -> false)
    const targetState = !isActive
    setServiceLoading(service, true, targetState)

    send({
      event: isActive ? 'service:stop' : 'service:start',
      service
    })
  }

  return (
    <aside className="flex flex-col items-center w-fit liquid-glass-light gap-1 z-20 overflow-visible pr-3 py-3">
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
                className="group relative btn btn-icon btn-icon-md btn-glass"
                style={isActive ? {
                  background: `linear-gradient(135deg, ${realmColor}33 0%, ${realmColor}1a 100%)`,
                  borderColor: `${realmColor}40`,
                  boxShadow: `0 0 12px ${realmColor}30, inset 0 1px 0 rgba(255,255,255,0.1)`
                } : undefined}
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
                  className="text-[10px]"
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
      <div className="flex-1 flex items-center justify-center">
        <span className="text-white/50 text-sm font-mono font-bold tracking-wider" style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)', whiteSpace: 'nowrap' }}>
          IRIS {version && `- ${version}`}
        </span>
      </div>

      {/* Logs button - above Chronicle */}
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
          delay: (!initialLoadDone || loadStage < 5) ? 0.10 : 0
        }}
      >
        <LogsButton send={send} />
      </motion.div>

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

      {/* Eye button + Spawn menu */}
      <motion.div
        className="relative flex flex-col items-center"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{
          opacity: loadStage >= 5 ? 1 : 0,
          scale: loadStage >= 5 ? 1 : 0.8
        }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 25,
          delay: (!initialLoadDone || loadStage < 5) ? 0.2 : 0
        }}
        onMouseEnter={() => setSidebarButtonsExpanded(true)}
        onMouseLeave={() => setSidebarButtonsExpanded(false)}
      >
        {/* Spawn menu - positioned to the right of eye */}
        <AnimatePresence>
          {sidebarButtonsExpanded && (
            <motion.div
              className="absolute left-full bottom-0 ml-2 flex flex-col gap-3 items-center p-2 bg-black/40 backdrop-blur-md rounded-xl border border-white/10 z-50"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {/* System */}
              <div className="flex gap-1.5">
                <DraggableTypeButton
                  entityType="settings"
                  title="Settings - drag to split"
                  onClick={() => onSpawnEntity('settings')}
                />
                <DraggableTypeButton
                  entityType="cemetery"
                  title="Cemetery - drag to split"
                  onClick={() => onSpawnEntity('cemetery')}
                />
              </div>

              {/* Social & Media */}
              <div className="flex gap-1.5">
                <DraggableTypeButton
                  entityType="youtube-music"
                  title="YouTube Music - drag to split"
                  onClick={() => onSpawnEntity('youtube-music')}
                />
                <DraggableTypeButton
                  entityType="rsvp"
                  title="RSVP Speed Reader - drag to split"
                  onClick={() => onSpawnEntity('rsvp')}
                />
              </div>

              {/* Productivity */}
              <div className="flex gap-1.5">
                <DraggableTypeButton
                  entityType="linear"
                  title="Linear - drag to split"
                  onClick={() => onSpawnEntity('linear')}
                />
                <DraggableTypeButton
                  entityType="calendar"
                  title="Calendar - drag to split"
                  onClick={() => onSpawnEntity('calendar')}
                />
                <DraggableTypeButton
                  entityType="history"
                  title="History - drag to split"
                  onClick={() => onSpawnEntity('history')}
                />
                <DraggableTypeButton
                  entityType="oracle"
                  title="Oracle - drag to split"
                  onClick={() => onSpawnEntity('oracle')}
                />
                <DraggableTypeButton
                  entityType="pomodoro"
                  title="Pomodoro - drag to split"
                  onClick={() => onSpawnEntity('pomodoro')}
                />
                <DraggableTypeButton
                  entityType="todo"
                  title="Todo - drag to split"
                  onClick={() => onSpawnEntity('todo')}
                />
              </div>

              {/* Dev Tools */}
              <div className="flex gap-1.5">
                <DraggableTypeButton
                  entityType="terminal"
                  title="Terminal (Alt+R) - drag to split"
                  onClick={() => onSpawnEntity('terminal')}
                />
                <DraggableTypeButton
                  entityType="code"
                  title="Code Viewer - drag to split"
                  onClick={() => onSpawnEntity('code')}
                />
                <DraggableTypeButton
                  entityType="git"
                  title="Git - drag to split"
                  onClick={() => onSpawnEntity('git')}
                />
                <DraggableTypeButton
                  entityType="browser"
                  title="Browser - drag to split"
                  onClick={() => onSpawnEntity('browser')}
                />
                <DraggableTypeButton
                  entityType="draw"
                  title="Draw (SVG generator) - drag to split"
                  onClick={() => onSpawnEntity('draw')}
                />
              </div>

              {/* Divider */}
              <div className="w-full h-px bg-white/10" />

              {/* Primary: God & Personalities (large) */}
              <div className="flex gap-2">
                <DraggableTypeButton
                  entityType="god"
                  title="New god (Alt+N) - drag to split"
                  onClick={onOpenSummonModal}
                  size="large"
                />
                <DraggableTypeButton
                  entityType="personalities"
                  title="Personalities - drag to split"
                  onClick={() => onSpawnEntity('personalities')}
                  size="large"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Eye button */}
        <IconButton
          icon={faEye}
          size="md"
          variant="glass"
          onClick={() => onSidebarToggle()}
          title={sidebarCollapsed ? 'Expand sidebar (Alt+B)' : 'Collapse sidebar (Alt+B)'}
        />
      </motion.div>
    </aside>
  )
}
