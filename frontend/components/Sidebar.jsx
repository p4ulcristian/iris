import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import { useStore } from '../store'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCircle,
  faEarListen,
  faVolumeHigh,
  faXmark,
  faPlus,
  faScroll,
  faPlug,
  faTerminal,
  faTrash
} from '@fortawesome/free-solid-svg-icons'
import IconButton from './ui/IconButton'
import DraggableTypeButton from './DraggableTypeButton'
import EntityGroup from './EntityGroup'
import TileUngroupDropZone from './TileUngroupDropZone'
import { REALM_COLORS } from '../themes'
import { CHRONICLE_URL } from '../config'

// Constants
const MIN_WIDTH = 50
const MAX_WIDTH = 1000
const WIDTH_TRANSITION_MS = 150

function Spinner() {
  return (
    <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
  )
}

function ChronicleButton() {
  const [open, setOpen] = useState(false)
  const [lines, setLines] = useState([])
  const [cursor, setCursor] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)

  const chronicleDetails = useStore(state => state.chronicleDetails)
  const status = chronicleDetails || { running: false, volume: 0, start_time: null }

  const menuRef = useRef(null)
  const scrollRef = useRef(null)
  const loadMoreRef = useRef(null)
  const prevScrollHeight = useRef(0)

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

  useEffect(() => {
    if (!open || !loadMoreRef.current || loadingMore || !hasMore || initialLoading) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
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

  const formatTime = (startTime) => {
    if (!startTime) return '00:00'
    const elapsed = Math.floor(Date.now() / 1000 - startTime)
    const mins = Math.floor(elapsed / 60)
    const secs = elapsed % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const groupByDay = (lines) => {
    const groups = {}
    for (const line of lines) {
      const day = line.timestamp.split('T')[0]
      if (!groups[day]) groups[day] = []
      groups[day].push(line)
    }
    return groups
  }

  const formatDayHeader = (dateStr) => {
    const date = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (dateStr === today.toISOString().split('T')[0]) return 'Today'
    if (dateStr === yesterday.toISOString().split('T')[0]) return 'Yesterday'
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  }

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
  const days = Object.keys(grouped).sort()

  return (
    <div className="relative" ref={menuRef}>
      <IconButton
        icon={faScroll}
        size="md"
        variant="ghost"
        onClick={() => setOpen(!open)}
        title="Chronicle preview"
      />
      {open && (
        <div className="absolute left-full bottom-0 ml-2 w-[400px] max-h-[60vh] liquid-glass-popup flex flex-col z-50">
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-3 min-h-[200px] max-h-[calc(60vh-60px)]"
          >
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

  const fetchLogs = useCallback((type) => {
    if (!send) return
    send({ event: 'logs:read', type, lines: 200 })
  }, [send])

  useEffect(() => {
    if (!open) return

    const handleMessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.event === 'logs:data') {
          if (scrollRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
            wasAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 50
          }

          setLines(prev => ({ ...prev, [msg.type]: msg.lines || [] }))
          setLoading(false)

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

    const messageListeners = window.__irisWsMessageListeners
    if (messageListeners) {
      messageListeners.add(handleMessage)
      return () => messageListeners.delete(handleMessage)
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    setLoading(true)
    fetchLogs(activeTab)

    const interval = setInterval(() => {
      fetchLogs(activeTab)
    }, 1000)

    return () => clearInterval(interval)
  }, [open, activeTab, fetchLogs])

  const handleClear = () => {
    if (!send) return
    send({ event: 'logs:clear', type: activeTab })
  }

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
        variant="ghost"
        onClick={() => setOpen(!open)}
        title="System logs"
      />
      {open && (
        <div className="absolute left-full bottom-0 ml-2 w-[500px] max-h-[70vh] liquid-glass-popup flex flex-col z-50">
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

function ServicesDropdown({ connected, services, servicesLoading, onToggle, speakDetails, onVolumeChange }) {
  const [open, setOpen] = useState(false)
  const [localVolume, setLocalVolume] = useState(100)
  const [isDragging, setIsDragging] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!isDragging && speakDetails?.volume !== undefined) {
      setLocalVolume(Math.round(speakDetails.volume * 100))
    }
  }, [speakDetails?.volume, isDragging])

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (isDragging) return
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, isDragging])

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
        className="btn btn-ghost btn-icon btn-icon-md"
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

          {services.speak && (
            <div className="px-3 py-2 flex items-center gap-2">
              <span className="text-[10px] text-white/40 w-6">Vol</span>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={localVolume}
                onMouseDown={() => setIsDragging(true)}
                onMouseUp={() => {
                  setIsDragging(false)
                  onVolumeChange(localVolume / 100)
                }}
                onMouseLeave={() => {
                  if (isDragging) {
                    setIsDragging(false)
                    onVolumeChange(localVolume / 100)
                  }
                }}
                onChange={(e) => setLocalVolume(parseInt(e.target.value))}
                style={{ accentColor: '#22c55e' }}
                className="flex-1 h-2 cursor-pointer"
              />
              <span className="text-[10px] text-white/40 w-6 text-right">
                {localVolume}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Tabs section at top
function TabsSection({ tabs, activeTabId, onTabSelect, onTabClose, onTabNew, loadStage, initialLoadDone }) {
  return (
    <div className="flex flex-wrap gap-1.5 p-3 border-b border-white/10">
      <AnimatePresence>
        {tabs?.map((tab, idx) => {
          const isActive = activeTabId === tab.id
          const realmColor = REALM_COLORS[tab.name] || '#888888'
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
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{
                opacity: loadStage >= 2 ? 1 : 0,
                scale: loadStage >= 2 ? 1 : 0.8
              }}
              exit={{ opacity: 0, scale: 0.8 }}
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
  )
}

// Entity cards section (scrollable middle)
function EntityCardsSection({
  allStages,
  tabs,
  activeTabId,
  focusedEntity,
  onEntityClick,
  onEntityClose,
  onEntitySplit,
  onMoveToTab,
  onMoveToNewTab,
  onReorderInStage,
  onJoinStage,
  onCreateStageAtPosition,
}) {
  return (
    <TileUngroupDropZone className="flex-1 overflow-y-auto overflow-x-visible relative">
      {tabs.length > 0 && (
        <div className="relative h-full">
          {tabs.map((tab, tabIdx) => {
            const activeTabIdx = tabs.findIndex(t => t.id === activeTabId)
            const tabOffset = tabIdx - activeTabIdx
            const isActiveTab = tab.id === activeTabId

            const tabStages = allStages
              ? allStages.filter(item => item.tabId === tab.id && !item.isEmpty)
              : []

            return (
              <motion.div
                key={tab.id}
                className="absolute inset-0 overflow-y-auto overflow-x-visible p-3"
                initial={false}
                animate={{ y: `${tabOffset * 100}vh` }}
                transition={{ type: 'spring', stiffness: 350, damping: 32 }}
                style={{
                  pointerEvents: isActiveTab ? 'auto' : 'none'
                }}
              >
                {tabStages.length > 0 && (
                  <LayoutGroup>
                    <div className="flex flex-col gap-3">
                      {tabStages.map((item, stageIdx) => {
                        const stage = item.stage || item
                        const activeTab = tabs.find(t => t.id === tab.id)
                        const isActiveStage = stage.id === activeTab?.activeStageId
                        const staggerOffset = tabStages
                          .slice(0, stageIdx)
                          .reduce((sum, s) => sum + ((s.stage || s).entities?.length || 0), 0)

                        return (
                          <EntityGroup
                            key={stage.id}
                            stage={stage}
                            entities={stage.entities || []}
                            isFocused={isActiveStage}
                            focusedEntityId={focusedEntity}
                            onClick={onEntityClick}
                            onClose={onEntityClose}
                            onSplit={(entityId) => onEntitySplit(entityId, stage.id)}
                            tabs={tabs}
                            activeTabId={tab.id}
                            onMoveToTab={onMoveToTab}
                            onMoveToNewTab={onMoveToNewTab}
                            onReorderInStage={onReorderInStage}
                            onJoinStage={onJoinStage}
                            onCreateStageAtPosition={onCreateStageAtPosition}
                            staggerOffset={staggerOffset}
                            stageIndex={stageIdx}
                            totalStages={tabStages.length}
                          />
                        )
                      })}
                    </div>
                  </LayoutGroup>
                )}
              </motion.div>
            )
          })}
        </div>
      )}
    </TileUngroupDropZone>
  )
}

// Spawn row section (horizontal scroll via vertical wheel)
function SpawnRow({ onSpawnEntity, onOpenSummonModal }) {
  const entityRegistry = useStore(s => s.entityRegistry)
  const scrollRef = useRef(null)

  // Convert vertical scroll to horizontal
  const handleWheel = useCallback((e) => {
    if (!scrollRef.current) return
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault()
      scrollRef.current.scrollLeft += e.deltaY
    }
  }, [])

  return (
    <div className="border-t border-white/10 py-3">
      <div
        ref={scrollRef}
        onWheel={handleWheel}
        className="flex gap-2 overflow-x-auto px-3 scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {entityRegistry._order?.map(type => {
          const entity = entityRegistry[type]
          if (!entity) return null
          const isGod = type === 'god'
          return (
            <div key={type} className="flex-shrink-0 w-16 aspect-square">
              <DraggableTypeButton
                entityType={type}
                title={entity.label}
                onClick={isGod ? onOpenSummonModal : () => onSpawnEntity(type)}
                showLabel
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Bottom menu section (services only)
function BottomMenu({ connected, send }) {
  const services = useStore(s => s.services)
  const servicesLoading = useStore(s => s.servicesLoading)
  const setServiceLoading = useStore(s => s.setServiceLoading)
  const speakDetails = useStore(s => s.speakDetails)
  const powers = useStore(s => s.settings?.powers ?? true)

  const handleServiceToggle = (service, isActive) => {
    if (!send) return
    const targetState = !isActive
    setServiceLoading(service, true, targetState)
    send({
      event: isActive ? 'service:stop' : 'service:start',
      service
    })
  }

  const handleVolumeChange = (volume) => {
    if (!send) return
    send({ event: 'speak:volume', volume })
  }

  return (
    <div className="border-t border-white/10 py-3 pr-3">
      <div className="flex items-center justify-center gap-1">
        {/* Services status */}
        {powers && (
          <ServicesDropdown
            connected={connected}
            services={services}
            servicesLoading={servicesLoading}
            onToggle={handleServiceToggle}
            speakDetails={speakDetails}
            onVolumeChange={handleVolumeChange}
          />
        )}

        {/* Logs */}
        <LogsButton send={send} />

        {/* Chronicle */}
        {powers && <ChronicleButton />}
      </div>
    </div>
  )
}

// Resize handle
function ResizeHandle({ onResizeStart }) {
  return (
    <>
      {/* Left edge line (visual only) */}
      <div className="absolute left-0 top-0 bottom-0 w-1" />
      {/* Right edge resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-white/20 transition-colors z-10"
        onMouseDown={onResizeStart}
        style={{ touchAction: 'none', userSelect: 'none' }}
      />
    </>
  )
}

// Main Sidebar component
export default function Sidebar({
  connected,
  send,
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onTabNew,
  allStages,
  focusedEntity,
  loadStage,
  initialLoadDone,
  onEntityClick,
  onEntityClose,
  onEntitySplit,
  onMoveToTab,
  onMoveToNewTab,
  onReorderInStage,
  onJoinStage,
  onCreateStageAtPosition,
  onSpawnEntity,
  onOpenSummonModal,
  width,
  onWidthChange,
}) {
  const [isDragging, setIsDragging] = useState(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(width)

  const handleResizeStart = useCallback((e) => {
    e.preventDefault()
    setIsDragging(true)
    startXRef.current = e.clientX
    startWidthRef.current = width
  }, [width])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e) => {
      const delta = e.clientX - startXRef.current
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidthRef.current + delta))
      onWidthChange(newWidth)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, onWidthChange])

  return (
    <aside
      className="flex flex-col liquid-glass-light z-20 overflow-visible relative"
      style={{
        width,
        transition: isDragging ? 'none' : `width ${WIDTH_TRANSITION_MS}ms ease-in-out`
      }}
    >
      {/* Tabs at top */}
      <TabsSection
        tabs={tabs}
        activeTabId={activeTabId}
        onTabSelect={onTabSelect}
        onTabClose={onTabClose}
        onTabNew={onTabNew}
        loadStage={loadStage}
        initialLoadDone={initialLoadDone}
      />

      {/* Entity cards in middle (scrollable) */}
      <EntityCardsSection
        allStages={allStages}
        tabs={tabs}
        activeTabId={activeTabId}
        focusedEntity={focusedEntity}
        onEntityClick={onEntityClick}
        onEntityClose={onEntityClose}
        onEntitySplit={onEntitySplit}
        onMoveToTab={onMoveToTab}
        onMoveToNewTab={onMoveToNewTab}
        onReorderInStage={onReorderInStage}
        onJoinStage={onJoinStage}
        onCreateStageAtPosition={onCreateStageAtPosition}
      />

      {/* Spawn row */}
      <SpawnRow
        onSpawnEntity={onSpawnEntity}
        onOpenSummonModal={onOpenSummonModal}
      />

      {/* Bottom menu (services) */}
      <BottomMenu connected={connected} send={send} />

      {/* Resize handle */}
      <ResizeHandle onResizeStart={handleResizeStart} />
    </aside>
  )
}
