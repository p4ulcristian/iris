import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Reorder, AnimatePresence, motion } from 'framer-motion'
import TileCard from './components/TileCard'
import TerminalContent from './components/TerminalContent'
import EntityCard from './components/EntityCard'
import EntityGroup from './components/EntityGroup'
import LeftWing from './components/LeftWing'
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
import CodeView from './components/CodeView'
import OracleView from './components/OracleView'
import Surface from './components/Surface'
import DraggableTypeButton from './components/DraggableTypeButton'
import RootDropZone from './components/RootDropZone'
import { DragProvider } from './contexts/DragContext'
import { useWebSocket } from './hooks/useWebSocket'
import { useStore } from './store'
import { WS_URL } from './config'
import { setupGlobalErrorHandlers } from './utils/error-reporter'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTerminal, faClockRotateLeft, faGear, faSkull, faCalendar, faChevronLeft, faChevronRight, faRobot } from '@fortawesome/free-solid-svg-icons'

// Type icons
import claudeIcon from './assets/icons/claude.png'
import linearIcon from './assets/icons/linear.png'
import gitIcon from './assets/icons/git.png'
import nvimIcon from './assets/icons/nvim.png'
import browserIcon from './assets/icons/browser.png'
import vscodeIcon from './assets/icons/vscode.svg'

export default function App() {
  const { connected, send, lastMessage } = useWebSocket(WS_URL)

  // Get state and actions from store
  const tabs = useStore(s => s.tabs)
  const activeTabId = useStore(s => s.activeTabId)
  const entities = useStore(s => s.entities)
  const focusedEntity = useStore(s => s.focusedEntity)
  const focusedTile = useStore(s => s.focusedTile)
  const layoutMode = useStore(s => s.layoutMode)
  const initialLoadDone = useStore(s => s.initialLoadDone)
  const theme = useStore(s => s.theme)
  const godColors = useStore(s => s.godColors)
  const getActiveLayout = useStore(s => s.getActiveLayout)

  // Actions
  const updateEntityStatus = useStore(s => s.updateEntityStatus)
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

  // Sidebar responsive breakpoint
  const SIDEBAR_BREAKPOINT = 900

  // Initialize sidebar state based on window size
  const getInitialSidebarState = () => typeof window !== 'undefined' && window.innerWidth < SIDEBAR_BREAKPOINT
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getInitialSidebarState)
  const [sidebarShowCards, setSidebarShowCards] = useState(() => !getInitialSidebarState())
  const [sidebarShowIcons, setSidebarShowIcons] = useState(getInitialSidebarState)
  const [sidebarShowButtons, setSidebarShowButtons] = useState(() => !getInitialSidebarState())
  const [sidebarAutoMode, setSidebarAutoMode] = useState(true) // Track if user manually toggled
  const sidebarAutoModeRef = useRef(true) // Ref for stable access in callbacks
  const [sidebarButtonsExpanded, setSidebarButtonsExpanded] = useState(false) // Hover expand for extra buttons

  // Sidebar animation timing (in ms)
  const CARDS_DURATION = 200
  const ICONS_DURATION = 200
  const WIDTH_DURATION = 150
  const BUTTON_DURATION = 150

  // Track if animation is in progress to prevent ResizeObserver interference
  const sidebarAnimatingRef = useRef(false)

  // Handle sidebar toggle with sequenced animation
  const handleSidebarToggle = useCallback((auto = false) => {
    // If manual toggle, disable auto mode
    if (!auto) {
      setSidebarAutoMode(false)
      sidebarAutoModeRef.current = false
    }

    // Prevent re-triggering during animation
    if (sidebarAnimatingRef.current) return
    sidebarAnimatingRef.current = true

    if (!sidebarCollapsed) {
      // CLOSING: buttons slide left → cards slide up → icons slide up → width collapses
      setSidebarShowButtons(false)
      setTimeout(() => {
        setSidebarShowCards(false)
        setTimeout(() => {
          setSidebarShowIcons(true)
          setTimeout(() => {
            setSidebarCollapsed(true)
            sidebarAnimatingRef.current = false
          }, ICONS_DURATION)
        }, CARDS_DURATION)
      }, BUTTON_DURATION)
    } else {
      // OPENING: width expands → icons slide down → cards slide down → buttons slide in
      setSidebarCollapsed(false)
      setTimeout(() => {
        setSidebarShowIcons(false)
        setTimeout(() => {
          setSidebarShowCards(true)
          setTimeout(() => {
            setSidebarShowButtons(true)
            sidebarAnimatingRef.current = false
          }, CARDS_DURATION)
        }, ICONS_DURATION)
      }, WIDTH_DURATION)
    }
  }, [sidebarCollapsed])

  // Auto-collapse sidebar based on container size (works with dev tools too)
  const mainContainerRef = useRef(null)
  const sidebarObserverRef = useRef(null)
  const sidebarCollapsedRef = useRef(sidebarCollapsed)
  sidebarCollapsedRef.current = sidebarCollapsed

  // Track which side of breakpoint we're on to detect crossings
  const lastBreakpointSideRef = useRef(null)

  useEffect(() => {
    if (!mainContainerRef.current) return

    let resizeTimeout
    const handleResize = (entries) => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        // Skip if animation is in progress
        if (sidebarAnimatingRef.current) return

        const width = entries[0]?.contentRect?.width || window.innerWidth
        const shouldCollapse = width < SIDEBAR_BREAKPOINT

        // Detect breakpoint crossing - re-enable auto mode when crossing
        if (lastBreakpointSideRef.current !== null && lastBreakpointSideRef.current !== shouldCollapse) {
          sidebarAutoModeRef.current = true
          setSidebarAutoMode(true)
        }
        lastBreakpointSideRef.current = shouldCollapse

        // Only auto-toggle if in auto mode
        if (!sidebarAutoModeRef.current) return

        if (shouldCollapse !== sidebarCollapsedRef.current) {
          handleSidebarToggle(true) // true = auto toggle
        }
      }, 150) // Debounce
    }

    sidebarObserverRef.current = new ResizeObserver(handleResize)
    sidebarObserverRef.current.observe(mainContainerRef.current)

    return () => {
      clearTimeout(resizeTimeout)
      if (sidebarObserverRef.current) {
        sidebarObserverRef.current.disconnect()
      }
    }
  }, [handleSidebarToggle])

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

        doSync()
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

      case 'code:file:open':
        // Dispatch window event for CodeView to handle
        window.dispatchEvent(new CustomEvent('iris:code:open', { detail: data }))
        break

      case 'warning':
        console.warn(`⚠️ ${data.message}`, data.hint ? `\n   ${data.hint}` : '')
        break
    }
  }, [lastMessage, syncState, updateEntityStatus, setInitialLoadDone, setServices, focusedEntity, initialLoadDone])

  // Get entities for active tab - memoized to prevent drag reset
  const activeEntities = useMemo(() => {
    return Object.values(entities)
      .filter(e => e.tabId === activeTabId)
      .sort((a, b) => (a.order || 0) - (b.order || 0))
  }, [entities, activeTabId])

  const activeGods = useMemo(() => {
    return Object.values(entities)
      .filter(e => e.tabId === activeTabId && (e.type === 'god' || e.type === 'terminal'))
      .sort((a, b) => (a.order || 0) - (b.order || 0))
  }, [entities, activeTabId])

  // Helper: collect all entity IDs from a layout tree
  const collectEntityIds = useCallback((node) => {
    if (!node) return []
    if (node.type === 'tile') {
      // Support both new entityId and legacy entityIds format
      if (node.entityId) return [node.entityId]
      if (node.entityIds?.length) return node.entityIds
      return []
    }
    if (node.type === 'split' && node.children) {
      return node.children.flatMap(child => collectEntityIds(child))
    }
    return []
  }, [])

  // Get stages for active tab with their entities (grouped by stage)
  const activeStages = useMemo(() => {
    const activeTab = tabs.find(t => t.id === activeTabId)
    const stages = activeTab?.stages || []
    return stages.map(stage => {
      const entityIds = collectEntityIds(stage.layout)
      return {
        ...stage,
        entities: entityIds
          .map(id => entities[id])
          .filter(Boolean)
      }
    })
  }, [tabs, activeTabId, entities, collectEntityIds])

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
        (e.ctrlKey && ['n', 'k', 'f', 'l', 'd', 'r', 'b', 'arrowup', 'arrowdown'].includes(key)) ||
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

      // Ctrl+B: Toggle sidebar
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault()
        e.stopPropagation()
        handleSidebarToggle()
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

      // Ctrl+F: Toggle window fullscreen
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault()
        e.stopPropagation()
        window.iris.windowControl('toggle-fullscreen')
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

      // Escape: Clear focus
      if (e.key === 'Escape' && focusedEntity) {
        handleSetFocus(null)
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
    handleSpawnRandomGod, handleSpawnTerminal, handleKillEntity, handleKillTab,
    rotateLayout, focusedEntity, activeEntities,
    toggleDevPanel, handleSetFocus, handleSidebarToggle, send, tabs, activeTabId
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
    <DragProvider>
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
      <div ref={mainContainerRef} className="flex flex-1 min-h-0 p-3">
        {/* Left Wing (Realms + Powers) */}
        <LeftWing
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
        <main className="flex-1 min-h-0 overflow-visible">
          {/* Main layout: focused entity + sidebar */}
          <div className="flex h-full">
            {/* Main focused entity area */}
            <div ref={godContainerRef} className="flex-[2] min-w-0 relative h-full">
              <RootDropZone tabId={activeTabId} hasLayout={!!getActiveLayout()}>
              {(() => {
                const activeLayout = getActiveLayout()

                // If we have stages, render all with spring y positions (Apple-style)
                const activeTab = tabs.find(t => t.id === activeTabId)
                const stages = activeTab?.stages || []
                const activeStageId = activeTab?.activeStageId
                const activeIdx = stages.findIndex(s => s.id === activeStageId)

                if (stages.length > 0) {
                  return (
                    <div className="relative h-full overflow-hidden">
                      {stages.map((stage, idx) => {
                        const offset = idx - activeIdx
                        return (
                          <motion.div
                            key={stage.id}
                            className="absolute inset-0"
                            animate={{ y: `${offset * 100}%` }}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                          >
                            <Surface
                              node={stage.layout}
                              tabId={activeTabId}
                              entities={entities}
                              focusedTile={focusedTile}
                              focusedEntity={focusedEntity}
                              containerSize={containerSize}
                            />
                          </motion.div>
                        )
                      })}
                    </div>
                  )
                }

                // Legacy mode: no layout tree, render flat entity list
                if (activeEntities.length === 0) {
                  return (
                    <div className="h-full flex flex-col items-center justify-center gap-3 text-text-secondary">
                      <p className="text-base">No entities</p>
                      <p className="text-sm opacity-70">
                        Drag an entity here or press <kbd className="px-1.5 py-0.5 bg-bg-tertiary border border-border rounded text-xs font-mono">Ctrl+N</kbd> to add
                      </p>
                    </div>
                  )
                }

                // Legacy entity stack rendering
                return (
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
                            <TileCard
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
                                <LinearView send={send} connected={connected} />
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
                              {entity.type === 'code' && (
                                <CodeView entityId={entity.id} />
                              )}
                              {entity.type === 'oracle' && (
                                <OracleView entityId={entity.id} />
                              )}
                            </TileCard>
                          )}
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                )
              })()}
              </RootDropZone>
            </div>

            {/* Sidebar with all entities as task cards */}
            <motion.div
              className="flex flex-col overflow-hidden relative pl-3"
              animate={{
                width: sidebarCollapsed ? 48 : 288
              }}
              transition={{
                duration: WIDTH_DURATION / 1000,
                ease: 'easeInOut'
              }}
            >
              {/* Two card sets with choreographed animations */}
              <div className="flex-1 relative overflow-hidden pb-12">
                {/* Full task cards - slide up to exit, slide down to enter */}
                <AnimatePresence>
                  {sidebarShowCards && (
                    <motion.div
                      key="cards"
                      className="absolute inset-0 overflow-y-auto overflow-x-visible pb-16"
                      initial={{ y: '-100%' }}
                      animate={{ y: 0 }}
                      exit={{ y: '-100%' }}
                      transition={{ duration: CARDS_DURATION / 1000, ease: 'easeInOut' }}
                    >
                      {activeStages.length > 0 ? (
                        <div className="flex flex-col gap-3">
                          {activeStages.map((stage) => {
                            const activeTab = tabs.find(t => t.id === activeTabId)
                            const isActiveStage = stage.id === activeTab?.activeStageId
                            return (
                              <EntityGroup
                                key={stage.id}
                                stage={stage}
                                entities={stage.entities}
                                isFocused={isActiveStage}
                                focusedEntityId={focusedEntity}
                                onClick={(entityId) => {
                                  send({ event: 'focus:set', entityId })
                                }}
                                onClose={(entityId) => handleKillEntity(entityId)}
                                onSplit={(entityId) => {
                                  send({ event: 'stage:split', entityId, stageId: stage.id })
                                }}
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
                            )
                          })}
                        </div>
                      ) : activeEntities.length > 0 ? (
                        /* Fallback: no stages data, render flat entity list */
                        <Reorder.Group
                          axis="y"
                          values={activeEntities}
                          onReorder={handleEntityReorder}
                          className="flex flex-col gap-3"
                        >
                          {activeEntities.map((entity) => (
                            <EntityCard
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
                        </Reorder.Group>
                      ) : null}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Icon strip - slide up from bottom to enter, slide down to exit */}
                <AnimatePresence>
                  {sidebarShowIcons && (
                    <motion.div
                      key="icons"
                      className="absolute inset-0 overflow-y-auto overflow-x-hidden flex flex-col items-center gap-1.5 pt-1"
                      initial={{ y: '100%' }}
                      animate={{ y: 0 }}
                      exit={{ y: '100%' }}
                      transition={{ duration: ICONS_DURATION / 1000, ease: 'easeInOut' }}
                    >
                      {activeEntities.map((entity) => {
                        const entityColor = entity.type === 'god'
                          ? (godColors[entity.name?.toLowerCase()] || entity.color || '#888')
                          : (entity.color || '#888')
                        return (
                          <motion.button
                            key={entity.id}
                            onClick={() => handleSetFocus(entity.id)}
                            className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg cursor-pointer transition-all hover:bg-white/10"
                            style={{
                              backgroundColor: entity.id === effectiveFocusedEntity ? `${entityColor}33` : 'transparent',
                              border: `2px solid ${entity.id === effectiveFocusedEntity ? entityColor : 'transparent'}`
                            }}
                            title={entity.displayName || entity.name}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            {entity.type === 'god' && <img src={claudeIcon} alt="Claude" className="w-4 h-4 object-contain" />}
                            {entity.type === 'terminal' && <FontAwesomeIcon icon={faTerminal} className="text-white/70 text-sm" />}
                            {entity.type === 'nvim' && <img src={nvimIcon} alt="Nvim" className="w-4 h-4 object-contain" />}
                            {entity.type === 'browser' && <img src={browserIcon} alt="Browser" className="w-4 h-4 object-contain" />}
                            {entity.type === 'linear' && <img src={linearIcon} alt="Linear" className="w-4 h-4 object-contain" />}
                            {entity.type === 'git' && <img src={gitIcon} alt="Git" className="w-4 h-4 object-contain" />}
                            {entity.type === 'code' && <FontAwesomeIcon icon={faCode} className="text-white/70 text-sm" />}
                            {entity.type === 'calendar' && <FontAwesomeIcon icon={faCalendar} className="text-white/70 text-sm" />}
                            {entity.type === 'history' && <FontAwesomeIcon icon={faClockRotateLeft} className="text-white/70 text-sm" />}
                            {entity.type === 'settings' && <FontAwesomeIcon icon={faGear} className="text-white/70 text-sm" />}
                            {entity.type === 'cemetery' && <FontAwesomeIcon icon={faSkull} className="text-white/70 text-sm" />}
                            {entity.type === 'oracle' && <span className="text-sm">🔮</span>}
                          </motion.button>
                        )
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Floating collapse button - bottom left, centered when collapsed */}
                <button
                  onClick={() => handleSidebarToggle()}
                  className="absolute bottom-0 left-0 z-10 flex items-center justify-center w-8 h-8 rounded-lg bg-black/40 backdrop-blur-md border border-white/10 text-white/60 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
                  title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  <FontAwesomeIcon
                    icon={sidebarCollapsed ? faChevronLeft : faChevronRight}
                    className="w-4 h-4"
                  />
                </button>

                {/* Floating favorites + extras - bottom right */}
                <AnimatePresence>
                  {sidebarShowButtons && (
                    <motion.div
                      className="absolute bottom-0 right-0 z-10 flex flex-col items-end"
                      initial={{ x: '100%', opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: '100%', opacity: 0 }}
                      transition={{ duration: BUTTON_DURATION / 1000, ease: 'easeInOut' }}
                      onMouseEnter={() => setSidebarButtonsExpanded(true)}
                      onMouseLeave={() => setSidebarButtonsExpanded(false)}
                    >
                      {/* Extra buttons - slide up on hover */}
                      <AnimatePresence>
                        {sidebarButtonsExpanded && (
                          <motion.div
                            className="mb-1.5 flex flex-col gap-1.5 items-end p-1.5 bg-black/40 backdrop-blur-md rounded-xl border border-white/10"
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 20, opacity: 0 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                          >
                            {/* Row 3: Settings, Cemetery, Oracle */}
                            <div className="flex gap-1.5">
                              <DraggableTypeButton
                                entityType="settings"
                                icon={faGear}
                                title="Settings - drag to split"
                                onClick={() => handleSpawnEntity('settings')}
                              />
                              <DraggableTypeButton
                                entityType="cemetery"
                                icon={faSkull}
                                title="Cemetery - drag to split"
                                onClick={() => handleSpawnEntity('cemetery')}
                              />
                              <DraggableTypeButton
                                entityType="oracle"
                                icon={faRobot}
                                title="Oracle (Local LLM) - drag to split"
                                onClick={() => handleSpawnEntity('oracle')}
                              />
                            </div>
                            {/* Row 2: Calendar, Git, History */}
                            <div className="flex gap-1.5">
                              <DraggableTypeButton
                                entityType="calendar"
                                icon={faCalendar}
                                title="Calendar - drag to split"
                                onClick={() => handleSpawnEntity('calendar')}
                              />
                              <DraggableTypeButton
                                entityType="git"
                                iconComponent={<img src={gitIcon} alt="Git" className="w-4 h-4 object-contain" />}
                                title="Git - drag to split"
                                onClick={() => handleSpawnEntity('git')}
                              />
                              <DraggableTypeButton
                                entityType="history"
                                icon={faClockRotateLeft}
                                title="History - drag to split"
                                onClick={() => handleSpawnEntity('history')}
                              />
                            </div>
                            {/* Row 1: Terminal, Nvim, Browser */}
                            <div className="flex gap-1.5">
                              <DraggableTypeButton
                                entityType="terminal"
                                icon={faTerminal}
                                title="New terminal (Ctrl+R) - drag to split"
                                onClick={handleSpawnTerminal}
                              />
                              <DraggableTypeButton
                                entityType="nvim"
                                iconComponent={<img src={nvimIcon} alt="Nvim" className="w-4 h-4 object-contain" />}
                                title="New nvim - drag to split"
                                onClick={() => send({ event: 'nvim:spawn' })}
                              />
                              <DraggableTypeButton
                                entityType="browser"
                                iconComponent={<img src={browserIcon} alt="Browser" className="w-4 h-4 object-contain" />}
                                title="New browser - drag to split"
                                onClick={() => handleSpawnEntity('browser')}
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Favorites row */}
                      <div className="flex gap-1.5 p-1.5 bg-black/40 backdrop-blur-md rounded-xl border border-white/10">
                        <DraggableTypeButton
                          entityType="god"
                          iconComponent={<img src={claudeIcon} alt="Claude" className="w-4 h-4 object-contain" />}
                          title="New god (Ctrl+N) - drag to split"
                          onClick={() => setSummonModalOpen(true)}
                        />
                        <DraggableTypeButton
                          entityType="linear"
                          iconComponent={<img src={linearIcon} alt="Linear" className="w-4 h-4 object-contain" />}
                          title="Linear - drag to split"
                          onClick={() => handleSpawnEntity('linear')}
                        />
                        <DraggableTypeButton
                          entityType="code"
                          iconComponent={<img src={vscodeIcon} alt="Code" className="w-4 h-4 object-contain" />}
                          title="Code viewer - drag to split"
                          onClick={() => handleSpawnEntity('code')}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
      </main>
      </div>

      {/* Hidden gods container - keeps terminals alive when on other tabs */}
      <div className="fixed -left-[9999px] -top-[9999px] w-[800px] h-[600px] overflow-hidden pointer-events-none" aria-hidden="true">
        {hiddenGods.map(god => (
          <div key={god.id} className="w-full h-full">
            <TileCard entity={god} isFocused={false}>
              <TerminalContent
                entity={god}
                isFocused={false}
                isHidden={true}
                expectedWidth={800}
                expectedHeight={600}
              />
            </TileCard>
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
    </DragProvider>
  )
}
