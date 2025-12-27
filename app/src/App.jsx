import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Reorder, AnimatePresence, motion } from 'framer-motion'
import EntityCard from './components/EntityCard'
import TerminalContent from './components/TerminalContent'
import GodTaskCard from './components/GodTaskCard'
import StatusBar from './components/StatusBar'
import ConfirmModal from './components/ConfirmModal'
import SummonModal from './components/SummonModal'
import DevPanel from './components/DevPanel'
import HistoryView from './components/HistoryView'
import BrowserView from './components/BrowserView'
import GitView from './components/GitView'
import LinearView from './components/LinearView'
import SettingsView from './components/SettingsView'
import CemeteryView from './components/CemeteryView'
import CalendarView from './components/CalendarView'
import { useWebSocket } from './hooks/useWebSocket'
import { useStore } from './store'
import { withViewTransition } from './hooks/useViewTransition'
import { WS_URL } from './config'
import { setupGlobalErrorHandlers } from './utils/error-reporter'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTerminal, faCode, faGlobe, faClockRotateLeft, faGear, faSkull, faPlus, faCalendar } from '@fortawesome/free-solid-svg-icons'

// Type icons
import claudeIcon from './assets/icons/claude.png'
import linearIcon from './assets/icons/linear.png'
import gitIcon from './assets/icons/git.png'
import nvimIcon from './assets/icons/nvim.png'
import browserIcon from './assets/icons/browser.png'

export default function App() {
  const { connected, send, lastMessage } = useWebSocket(WS_URL)

  // Get state and actions from store
  const tabs = useStore(s => s.tabs)
  const activeTabId = useStore(s => s.activeTabId)
  const entities = useStore(s => s.entities)
  const focusedEntity = useStore(s => s.focusedEntity)
  const fullscreenEntity = useStore(s => s.fullscreenEntity)
  const layoutMode = useStore(s => s.layoutMode)
  const initialLoadDone = useStore(s => s.initialLoadDone)
  const theme = useStore(s => s.theme)
  const godColors = useStore(s => s.godColors)

  // Actions
  const updateEntityStatus = useStore(s => s.updateEntityStatus)
  const toggleFullscreen = useStore(s => s.toggleFullscreen)
  const rotateLayout = useStore(s => s.rotateLayout)
  const setConnected = useStore(s => s.setConnected)
  const setInitialLoadDone = useStore(s => s.setInitialLoadDone)
  const setServices = useStore(s => s.setServices)
  const toggleDevPanel = useStore(s => s.toggleDevPanel)
  const getActiveEntities = useStore(s => s.getActiveEntities)
  const getActiveGods = useStore(s => s.getActiveGods)
  const getEntitiesForTab = useStore(s => s.getEntitiesForTab)
  const getGodsForTab = useStore(s => s.getGodsForTab)
  const getAllGodNames = useStore(s => s.getAllGodNames)
  const getAllGods = useStore(s => s.getAllGods)
  const getAllEntities = useStore(s => s.getAllEntities)
  const syncState = useStore(s => s.syncState)

  const [confirmModal, setConfirmModal] = useState(null)
  const [summonModalOpen, setSummonModalOpen] = useState(false)

  // Refs for keyboard handlers (avoid stale closures)
  const tabsRef = useRef(tabs)
  const activeTabIdRef = useRef(activeTabId)
  useEffect(() => { tabsRef.current = tabs }, [tabs])
  useEffect(() => { activeTabIdRef.current = activeTabId }, [activeTabId])

  // Ref and state for measuring god card container
  const [containerSize, setContainerSize] = useState(null) // null = not measured yet
  const observerRef = useRef(null)

  // Callback ref that sets up ResizeObserver when element mounts
  const godContainerRef = useCallback((node) => {
    // Cleanup old observer
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }

    if (node) {
      const measure = () => {
        const rect = node.getBoundingClientRect()
        console.log('[App] Container size:', rect.width, 'x', rect.height)
        setContainerSize({ width: rect.width, height: rect.height })
      }

      measure()
      observerRef.current = new ResizeObserver(measure)
      observerRef.current.observe(node)
    }
  }, [])

  // Update connection status in store
  useEffect(() => {
    setConnected(connected)
  }, [connected, setConnected])

  // Setup global error handlers
  useEffect(() => {
    setupGlobalErrorHandlers(send)
  }, [send])

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return

    const { event, ...data } = lastMessage

    switch (event) {
      case 'state:sync': {
        const doSync = () => {
          syncState(data)
          if (data.services) {
            setServices(data.services)
          }
          setInitialLoadDone(true)
        }

        // View transition for focus changes
        if (initialLoadDone && data.focusedEntity !== focusedEntity) {
          withViewTransition(doSync)
        } else {
          doSync()
        }
        break
      }

      case 'services:status':
        if (data.services) {
          setServices(data.services)
        }
        break

      case 'entity:set-status':
      case 'god:set-status':
        updateEntityStatus(data.entityId || data.godName || data.name, data.status)
        break
    }
  }, [lastMessage, syncState, updateEntityStatus, setInitialLoadDone, setServices, focusedEntity, initialLoadDone])

  // Get entities for active tab
  const activeEntities = getActiveEntities()
  const activeGods = getActiveGods()  // Gods/terminals only (for terminal rendering)

  // Get focused entity object
  const focusedEntityObj = focusedEntity ? entities[focusedEntity] : null
  const focusedEntityType = focusedEntityObj?.type || 'god'

  // Dispatch refit event when entity count changes (for terminal resizing)
  useEffect(() => {
    // Small delay to let layout settle
    const timeout = setTimeout(() => {
      window.dispatchEvent(new Event('iris:refit'))
    }, 100)
    return () => clearTimeout(timeout)
  }, [activeEntities.length])

  // Dispatch refit on window resize
  useEffect(() => {
    let timeout
    const handleResize = () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        window.dispatchEvent(new Event('iris:refit'))
      }, 100)
    }
    window.addEventListener('resize', handleResize)
    return () => {
      clearTimeout(timeout)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  // Summon a new god (with specific name)
  const handleSummonGod = useCallback((name, task = '') => {
    send({
      event: 'god:spawn',
      name,
      task
    })
  }, [send])

  // Spawn a random available god
  const handleSpawnRandomGod = useCallback(() => {
    const allGods = Object.keys(godColors)
    const usedNames = getAllGodNames().map(n => n.toLowerCase())
    const availableGods = allGods.filter(g => !usedNames.includes(g))
    const godPool = availableGods.length > 0 ? availableGods : allGods
    const randomGod = godPool[Math.floor(Math.random() * godPool.length)]
    const name = randomGod.charAt(0).toUpperCase() + randomGod.slice(1)
    send({ event: 'god:spawn', name, task: '' })
  }, [send, godColors, getAllGodNames])

  // Spawn a raw terminal (no Claude)
  const handleSpawnTerminal = useCallback(() => {
    send({
      event: 'terminal:spawn'
    })
  }, [send])

  // Kill an entity (gods go to cemetery, can be resurrected)
  const handleKillEntity = useCallback((entityId) => {
    send({ event: 'entity:kill', entityId })
  }, [send])

  // Set focused entity (server event)
  const handleSetFocus = useCallback((entityId) => {
    send({ event: 'focus:set', entityId })
  }, [send])

  // Reorder entities via drag and drop
  const handleEntityReorder = useCallback((newOrder) => {
    // newOrder is array of entity objects, extract IDs in new order
    const orderedIds = newOrder.map(e => e.id)
    send({ event: 'entities:reorder', order: orderedIds })
  }, [send])

  // Toggle fullscreen with view transition
  const handleToggleFullscreen = useCallback((entityId) => {
    withViewTransition(() => toggleFullscreen(entityId))
  }, [toggleFullscreen])

  // Spawn a view entity
  const handleSpawnEntity = useCallback((type, data = {}) => {
    send({ event: 'entity:spawn', type, ...data })
  }, [send])

  // Kill current tab (with confirmation if not empty)
  const handleKillTab = useCallback((tabId = activeTabId) => {
    const tab = tabs.find(t => t.id === tabId)
    if (!tab) return

    const tabEntities = getEntitiesForTab(tabId)

    if (tabs.length === 1 && tabEntities.length === 0) {
      return // Don't close last empty tab
    }

    // Empty tab - close immediately without confirmation
    if (tabEntities.length === 0) {
      send({ event: 'tab:remove', tabId })
      return
    }

    const godCount = tabEntities.filter(e => e.type === 'god' || e.type === 'terminal').length

    setConfirmModal({
      title: `Close "${tab.name}"?`,
      message: godCount > 0
        ? `This will banish ${godCount} session${godCount > 1 ? 's' : ''}.`
        : 'This tab will be closed.',
      confirmText: 'Close',
      danger: true,
      onConfirm: () => {
        // Server handles killing all entities in tab
        send({ event: 'tab:remove', tabId })
        setConfirmModal(null)
      }
    })
  }, [tabs, activeTabId, send, getEntitiesForTab])

  // Calculate grid classes based on layout mode, god count, and screen width
  const getGridClass = (count) => {
    if (layoutMode === 'auto') {
      if (count === 1) return 'grid-cols-1'
      if (count === 2) return 'grid-cols-1 md:grid-cols-2'
      if (count <= 4) return 'grid-cols-1 md:grid-cols-2'
      if (count <= 6) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
      return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
    }
    const layouts = {
      '1x1': 'grid-cols-1',
      '2x1': 'grid-cols-1 md:grid-cols-2',
      '2x2': 'grid-cols-1 md:grid-cols-2',
      '3x2': 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
      '3x3': 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
    }
    return layouts[layoutMode] || 'grid-cols-1 md:grid-cols-2'
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase()

      // Check if this is one of our app shortcuts
      const isAppShortcut = (
        (e.ctrlKey && ['n', 'k', 'f', 'l', 'd', 'r', 'arrowup', 'arrowdown'].includes(key)) ||
        (e.altKey && (['n', 'k', ',', '.'].includes(key) || (e.key >= '1' && e.key <= '9')))
      )

      // Ignore inputs unless it's an app shortcut
      if (!isAppShortcut && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return

      // Ctrl+N: Open summon modal
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault()
        e.stopPropagation()
        setSummonModalOpen(true)
        return
      }

      // Alt+N: New tab
      if (e.altKey && e.key === 'n') {
        e.preventDefault()
        e.stopPropagation()
        send({ event: 'tab:add' })
        return
      }

      // Ctrl+K: Kill focused entity
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault()
        e.stopPropagation()
        if (focusedEntity) {
          handleKillEntity(focusedEntity)
        } else if (activeEntities.length === 1) {
          handleKillEntity(activeEntities[0].id)
        }
        return
      }

      // Alt+K: Kill current tab
      if (e.altKey && e.key === 'k') {
        e.preventDefault()
        e.stopPropagation()
        handleKillTab()
        return
      }

      // Ctrl+R: Spawn raw terminal
      if (e.ctrlKey && e.key === 'r') {
        e.preventDefault()
        e.stopPropagation()
        handleSpawnTerminal()
        return
      }

      // Ctrl+D: Toggle dev panel
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault()
        e.stopPropagation()
        toggleDevPanel()
        return
      }

      // Ctrl+F: Toggle fullscreen
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault()
        e.stopPropagation()
        handleToggleFullscreen()
        return
      }

      // Ctrl+L: Rotate layout
      if (e.ctrlKey && e.key === 'l') {
        e.preventDefault()
        e.stopPropagation()
        rotateLayout()
        return
      }

      // Alt+, and Alt+.: Previous/next tab
      if (e.altKey && e.key === ',') {
        e.preventDefault()
        e.stopPropagation()
        const idx = tabs.findIndex(t => t.id === activeTabId)
        const prevIdx = (idx - 1 + tabs.length) % tabs.length
        send({ event: 'tab:select', tabId: tabs[prevIdx].id })
        return
      }
      if (e.altKey && e.key === '.') {
        e.preventDefault()
        e.stopPropagation()
        const idx = tabs.findIndex(t => t.id === activeTabId)
        const nextIdx = (idx + 1) % tabs.length
        send({ event: 'tab:select', tabId: tabs[nextIdx].id })
        return
      }

      // Alt+1-9: Go to tab
      if (e.altKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        e.stopPropagation()
        const num = parseInt(e.key)
        if (num >= 1 && num <= tabs.length) {
          send({ event: 'tab:select', tabId: tabs[num - 1].id })
        }
        return
      }

      // Escape: Exit fullscreen, then clear focus
      if (e.key === 'Escape') {
        if (fullscreenEntity) {
          e.preventDefault()
          e.stopPropagation()
          handleToggleFullscreen()
          return
        } else if (focusedEntity) {
          handleSetFocus(null)
        }
      }

      // Ctrl+Up: Focus previous entity
      if (e.ctrlKey && e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        send({ event: 'focus:prev' })
        return
      }

      // Ctrl+Down: Focus next entity
      if (e.ctrlKey && e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        send({ event: 'focus:next' })
        return
      }

      // Ctrl+Left: Previous tab
      if (e.ctrlKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        e.stopPropagation()
        const t = tabsRef.current
        const a = activeTabIdRef.current
        console.log('Ctrl+Left', { t, a })
        if (t?.length > 0) {
          const idx = t.findIndex(x => x.id === a)
          const prev = (idx - 1 + t.length) % t.length
          console.log('switching', { idx, prev, to: t[prev]?.id })
          send({ event: 'tab:select', tabId: t[prev].id })
        }
        return
      }

      // Ctrl+Right: Next tab
      if (e.ctrlKey && e.key === 'ArrowRight') {
        e.preventDefault()
        e.stopPropagation()
        const t = tabsRef.current
        const a = activeTabIdRef.current
        console.log('Ctrl+Right', { t, a })
        if (t?.length > 0) {
          const idx = t.findIndex(x => x.id === a)
          const next = (idx + 1) % t.length
          console.log('switching', { idx, next, to: t[next]?.id })
          send({ event: 'tab:select', tabId: t[next].id })
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [
    handleSpawnRandomGod, handleSpawnTerminal, handleKillEntity, handleKillTab, handleToggleFullscreen,
    rotateLayout, focusedEntity, fullscreenEntity, activeEntities,
    toggleDevPanel, handleSetFocus, send, tabs, activeTabId
  ])

  // Get ALL gods for persistent terminal rendering
  const allGods = getAllGods()

  // Get hidden gods (on other tabs) - terminals stay mounted but invisible
  const hiddenGods = allGods.filter(g => g.tabId !== activeTabId)

  // Stack depth animation helpers for god/terminal cards
  const getStackPosition = (entityId, focusedId, entities) => {
    const focusedIdx = entities.findIndex(e => e.id === focusedId)
    const entityIdx = entities.findIndex(e => e.id === entityId)
    return entityIdx - focusedIdx  // 0 = focused, positive = behind
  }

  const getStackStyle = (position) => {
    // 3D carousel effect: cards tilt away as they recede
    const y = `${position * 90}%`
    const rotateX = position * -15  // Tilt back as it goes up/down
    const absPos = Math.abs(position)

    return {
      y,
      rotateX,
      opacity: absPos === 0 ? 1 : 0,
      scale: 1 - absPos * 0.08,
      zIndex: 10 - absPos,
      pointerEvents: position === 0 ? 'auto' : 'none'
    }
  }

  // Get effective focused entity (ensure it's in active tab)
  const effectiveFocusedEntity = (focusedEntity && activeEntities.some(e => e.id === focusedEntity))
    ? focusedEntity
    : activeEntities[0]?.id || null

  const effectiveFocusedEntityObj = effectiveFocusedEntity ? entities[effectiveFocusedEntity] : null
  const effectiveFocusedType = effectiveFocusedEntityObj?.type || null

  return (
    <div className={`flex flex-col h-screen theme-${theme}`}>
      {/* Animated wallpaper - uses theme colors */}
      <div className="wallpaper">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
        <div className="blob blob-4" />
        <div className="blob blob-5" />
        <div className="blob blob-6" />
      </div>

      {/* Main layout: sidebar + content */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar (tabs + services) */}
        <StatusBar
          connected={connected}
          send={send}
          tabs={tabs}
          activeTabId={activeTabId}
          onTabSelect={(tabId) => send({ event: 'tab:select', tabId })}
          onTabClose={handleKillTab}
          onTabNew={() => send({ event: 'tab:add' })}
          getEntitiesForTab={getEntitiesForTab}
        />

        {/* Main content area */}
        <main className="flex-1 min-h-0 overflow-visible py-2 pr-2">
        {activeEntities.length === 0 ? (
          /* Empty state */
          <div className="h-full flex flex-col items-center justify-center gap-3 text-text-secondary">
            <p className="text-base">No entities</p>
            <p className="text-sm opacity-70">
              Press <kbd className="px-1.5 py-0.5 bg-bg-tertiary border border-border rounded text-xs font-mono">Ctrl+N</kbd> to add
            </p>
          </div>
        ) : (
          /* Main layout: focused entity + sidebar */
          <div className="flex gap-3 h-full">
            {/* Main focused entity area */}
            <div ref={godContainerRef} className="flex-[2] min-w-0 relative h-full" style={{ perspective: '1200px' }}>
              {/* Render all entities with EntityCard wrapper */}
              <AnimatePresence mode="popLayout">
                {activeEntities.map(entity => {
                  const position = getStackPosition(entity.id, effectiveFocusedEntity, activeEntities)
                  const style = getStackStyle(position)

                  return (
                    <motion.div
                      key={entity.id}
                      initial={{ opacity: 0, y: '-100%', scale: 0.9, rotateX: 15 }}
                      animate={{
                        y: style.y,
                        rotateX: style.rotateX,
                        scale: style.scale,
                        opacity: style.opacity,
                        zIndex: style.zIndex,
                      }}
                      exit={{ opacity: 0, y: '100%', scale: 0.9, rotateX: -15 }}
                      transition={{
                        type: 'spring',
                        stiffness: 250,
                        damping: 25,
                        opacity: { type: 'tween', duration: 0.25, ease: 'easeOut' },
                      }}
                      className="absolute inset-0"
                      style={{
                        pointerEvents: style.pointerEvents,
                        transformOrigin: 'center center',
                      }}
                    >
                      {containerSize && (
                        <EntityCard
                          entity={entity}
                          isFocused={position === 0}
                          onClick={() => handleSetFocus(entity.id)}
                        >
                          {/* Render content based on entity type */}
                          {(entity.type === 'god' || entity.type === 'terminal') && (
                            <TerminalContent
                              entity={entity}
                              isFocused={position === 0}
                              expectedWidth={containerSize.width}
                              expectedHeight={containerSize.height}
                            />
                          )}
                          {entity.type === 'browser' && (
                            <BrowserView entityId={entity.id} />
                          )}
                          {entity.type === 'history' && (
                            <HistoryView send={send} />
                          )}
                          {entity.type === 'git' && (
                            <GitView send={send} />
                          )}
                          {entity.type === 'linear' && (
                            <LinearView send={send} />
                          )}
                          {entity.type === 'settings' && (
                            <SettingsView send={send} />
                          )}
                          {entity.type === 'cemetery' && (
                            <CemeteryView send={send} />
                          )}
                          {entity.type === 'calendar' && (
                            <CalendarView send={send} />
                          )}
                        </EntityCard>
                      )}
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>

            {/* Sidebar with all entities as task cards */}
            <div className="w-80 flex flex-col overflow-x-visible">
              {/* Scrollable task cards area */}
              <div className="flex-1 overflow-y-auto overflow-x-visible">
                <Reorder.Group
                  axis="y"
                  values={activeEntities}
                  onReorder={handleEntityReorder}
                  className="flex flex-col gap-4"
                >
                  <AnimatePresence mode="popLayout">
                    {activeEntities.map(entity => (
                      <GodTaskCard
                        key={entity.id}
                        entity={entity}
                        isActive={entity.id === effectiveFocusedEntity}
                        onClick={() => handleSetFocus(entity.id)}
                        onClose={() => handleKillEntity(entity.id)}
                        tabs={tabs}
                        activeTabId={activeTabId}
                        onMoveToTab={(entityId, tabId) => {
                          send({ event: 'entity:move', entityId, tabId })
                          send({ event: 'tab:select', tabId })
                        }}
                        onMoveToNewTab={(entityId) => {
                          send({ event: 'entity:move-to-new-tab', entityId })
                        }}
                      />
                    ))}
                  </AnimatePresence>
                </Reorder.Group>
              </div>
              {/* Action buttons - pinned to bottom */}
              <div className="grid grid-cols-5 gap-1.5 mt-3 flex-shrink-0">
                <button
                  onClick={handleSpawnRandomGod}
                  className="group relative flex items-center justify-center p-2 rounded-lg bg-black/40 border border-white/20 text-white/80 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
                  title="New god (Ctrl+N)"
                >
                  <img src={claudeIcon} alt="Claude" className="w-3.5 h-3.5 object-contain group-hover:opacity-0 transition-opacity duration-150" />
                  <FontAwesomeIcon icon={faPlus} className="absolute text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
                </button>
                <button
                  onClick={handleSpawnTerminal}
                  className="group relative flex items-center justify-center p-2 rounded-lg bg-black/40 border border-white/20 text-white/80 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
                  title="New terminal (Ctrl+R)"
                >
                  <FontAwesomeIcon icon={faTerminal} className="text-sm group-hover:opacity-0 transition-opacity duration-150" />
                  <FontAwesomeIcon icon={faPlus} className="absolute text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
                </button>
                <button
                  onClick={() => send({ event: 'nvim:spawn' })}
                  className="group relative flex items-center justify-center p-2 rounded-lg bg-black/40 border border-white/20 text-white/80 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
                  title="New nvim"
                >
                  <img src={nvimIcon} alt="Nvim" className="w-3.5 h-3.5 object-contain group-hover:opacity-0 transition-opacity duration-150" />
                  <FontAwesomeIcon icon={faPlus} className="absolute text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
                </button>
                <button
                  onClick={() => handleSpawnEntity('browser')}
                  className="group relative flex items-center justify-center p-2 rounded-lg bg-black/40 border border-white/20 text-white/80 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
                  title="New browser"
                >
                  <img src={browserIcon} alt="Browser" className="w-3.5 h-3.5 object-contain group-hover:opacity-0 transition-opacity duration-150" />
                  <FontAwesomeIcon icon={faPlus} className="absolute text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
                </button>
                <button
                  onClick={() => handleSpawnEntity('linear')}
                  className="group relative flex items-center justify-center p-2 rounded-lg bg-black/40 border border-white/20 text-white/80 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
                  title="Linear"
                >
                  <img src={linearIcon} alt="Linear" className="w-3.5 h-3.5 object-contain group-hover:opacity-0 transition-opacity duration-150" />
                  <FontAwesomeIcon icon={faPlus} className="absolute text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
                </button>
                <button
                  onClick={() => handleSpawnEntity('calendar')}
                  className="group relative flex items-center justify-center p-2 rounded-lg bg-black/40 border border-white/20 text-white/80 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
                  title="Calendar"
                >
                  <FontAwesomeIcon icon={faCalendar} className="text-sm group-hover:opacity-0 transition-opacity duration-150" />
                  <FontAwesomeIcon icon={faPlus} className="absolute text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
                </button>
                <button
                  onClick={() => handleSpawnEntity('git')}
                  className="group relative flex items-center justify-center p-2 rounded-lg bg-black/40 border border-white/20 text-white/80 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
                  title="Git"
                >
                  <img src={gitIcon} alt="Git" className="w-3.5 h-3.5 object-contain group-hover:opacity-0 transition-opacity duration-150" />
                  <FontAwesomeIcon icon={faPlus} className="absolute text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
                </button>
                <button
                  onClick={() => handleSpawnEntity('history')}
                  className="group relative flex items-center justify-center p-2 rounded-lg bg-black/40 border border-white/20 text-white/80 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
                  title="History"
                >
                  <FontAwesomeIcon icon={faClockRotateLeft} className="text-sm group-hover:opacity-0 transition-opacity duration-150" />
                  <FontAwesomeIcon icon={faPlus} className="absolute text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
                </button>
                <button
                  onClick={() => handleSpawnEntity('settings')}
                  className="group relative flex items-center justify-center p-2 rounded-lg bg-black/40 border border-white/20 text-white/80 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
                  title="Settings"
                >
                  <FontAwesomeIcon icon={faGear} className="text-sm group-hover:opacity-0 transition-opacity duration-150" />
                  <FontAwesomeIcon icon={faPlus} className="absolute text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
                </button>
                <button
                  onClick={() => handleSpawnEntity('cemetery')}
                  className="group relative flex items-center justify-center p-2 rounded-lg bg-black/40 border border-white/20 text-white/80 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
                  title="Cemetery"
                >
                  <FontAwesomeIcon icon={faSkull} className="text-sm group-hover:opacity-0 transition-opacity duration-150" />
                  <FontAwesomeIcon icon={faPlus} className="absolute text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      </div>

      {/* Hidden gods container - keeps terminals alive when on other tabs */}
      <div className="fixed -left-[9999px] -top-[9999px] w-[800px] h-[600px] overflow-hidden pointer-events-none" aria-hidden="true">
        {hiddenGods.map(god => (
          <div key={god.id} className="w-full h-full">
            <EntityCard entity={god} isFocused={false}>
              <TerminalContent
                entity={god}
                isFocused={false}
                isHidden={true}
                expectedWidth={800}
                expectedHeight={600}
              />
            </EntityCard>
          </div>
        ))}
      </div>

      {/* Confirm modal */}
      <ConfirmModal
        isOpen={!!confirmModal}
        title={confirmModal?.title}
        message={confirmModal?.message}
        confirmText={confirmModal?.confirmText}
        danger={confirmModal?.danger}
        onConfirm={confirmModal?.onConfirm}
        onCancel={() => setConfirmModal(null)}
      />

      {/* Summon modal */}
      <SummonModal
        isOpen={summonModalOpen}
        usedGodNames={getAllGodNames()}
        onSummon={(name, task) => {
          handleSummonGod(name, task)
          setSummonModalOpen(false)
        }}
        onCancel={() => setSummonModalOpen(false)}
      />

      {/* Dev panel */}
      <DevPanel />
    </div>
  )
}
