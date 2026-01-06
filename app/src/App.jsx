import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import TileCard from './components/TileCard'
import TerminalContent from './components/TerminalContent'
import LeftSidebar from './components/LeftSidebar'
import RightSidebar from './components/RightSidebar'
import ConfirmModal from './components/ConfirmModal'
import SummonModal from './components/SummonModal'
import ShortcutsPopup from './components/ShortcutsPopup'
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
import PersonalitiesView from './components/PersonalitiesView'
import PersonalityEditor from './components/PersonalityEditor'
import TraitEditor from './components/TraitEditor'
import MarkdownView from './components/MarkdownView'
import Surface from './components/Surface'
import RootDropZone from './components/RootDropZone'
import { DragProvider } from './contexts/DragContext'
import { useWebSocket } from './hooks/useWebSocket'
import { useStore } from './store'
import { WS_URL } from './config'
import { setupGlobalErrorHandlers } from './utils/error-reporter'

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
  const addSpawningEntity = useStore(s => s.addSpawningEntity)
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
  const triggerStagedReveal = useStore(s => s.triggerStagedReveal)
  const loadStage = useStore(s => s.loadStage)

  const [confirmModal, setConfirmModal] = useState(null)
  const [summonModalOpen, setSummonModalOpen] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)

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

  // Track if animation is in progress to prevent ResizeObserver interference
  const sidebarAnimatingRef = useRef(false)

  // Handle sidebar toggle - simplified
  const handleSidebarToggle = useCallback((auto = false) => {
    // If manual toggle, disable auto mode
    if (!auto) {
      setSidebarAutoMode(false)
      sidebarAutoModeRef.current = false
    }

    // Simple toggle
    setSidebarCollapsed(prev => {
      const newCollapsed = !prev
      setSidebarShowCards(!newCollapsed)
      setSidebarShowIcons(newCollapsed)
      setSidebarShowButtons(!newCollapsed)
      return newCollapsed
    })
  }, [])

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
          const isFirstLoad = !initialLoadDone
          syncState(data)
          if (data.services) {
            setServices(data.services)
          }
          setInitialLoadDone(true)
          // Trigger staged reveal animation on first load
          if (isFirstLoad) {
            triggerStagedReveal()
          }
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

      case 'md:file:open':
        // Dispatch window event for MarkdownView to handle
        window.dispatchEvent(new CustomEvent('iris:md:open', { detail: data }))
        break

      case 'god:spawn:failed': {
        // Spawn failed - update entity to show error state
        const failedGodName = data.godName
        console.error(`⛔ God spawn failed: ${failedGodName}`, data.error)

        // Update entity status to failed (no need to check if exists - updateEntityStatus handles that)
        updateEntityStatus(failedGodName, 'failed')

        // Show notification to user
        if (window.Notification?.permission === 'granted') {
          new Notification('Spawn Failed', {
            body: data.error || `Failed to summon ${failedGodName}`,
            icon: '/icon.png'
          })
        }
        break
      }

      case 'warning':
        console.warn(`⚠️ ${data.message}`, data.hint ? `\n   ${data.hint}` : '')
        break
    }
  }, [lastMessage, syncState, updateEntityStatus, setInitialLoadDone, setServices, focusedEntity, initialLoadDone, triggerStagedReveal])

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
  // Sorted by first entity's order so Ctrl+Up/Down matches visual order
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
    }).sort((a, b) => {
      const aOrder = a.entities[0]?.order ?? Infinity
      const bOrder = b.entities[0]?.order ?? Infinity
      return aOrder - bOrder
    })
  }, [tabs, activeTabId, entities, collectEntityIds])

  // Get focused entity object
  const focusedEntityObj = focusedEntity ? entities[focusedEntity] : null
  const focusedEntityType = focusedEntityObj?.type || 'god'


  // Summon a new god (with specific name)
  const handleSummonGod = useCallback((name, task = '', personality = 'god', project = null) => {
    // Optimistic UI: add entity immediately with 'spawning' state
    const godKey = name.toLowerCase()
    const color = godColors[godKey] || '#888'
    const currentEntities = Object.values(entities).filter(e => e.tabId === activeTabId)
    const maxOrder = currentEntities.reduce((max, e) => Math.max(max, e.order || 0), -1)

    addSpawningEntity({
      id: name,
      type: 'god',
      name,
      color,
      order: maxOrder + 1,
      mission: task || null,
    })

    // Send spawn request to server
    send({
      event: 'god:spawn',
      name,
      task,
      personality,
      project
    })
  }, [send, godColors, entities, activeTabId, addSpawningEntity])

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
      // Use e.code for physical key detection (works with Mac Option key)
      // On Mac, Option+letter produces special chars (e.g., Option+N = ñ)
      // but e.code still gives us "KeyN"
      const code = e.code

      // Check if this is one of our app shortcuts (all Alt-based for cross-platform)
      const appShortcutCodes = [
        'KeyN', 'KeyT', 'KeyW', 'KeyK', 'KeyR', 'KeyB', 'KeyD', 'KeyF',
        'Comma', 'Period', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
        'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'
      ]
      const isAppShortcut = e.altKey && appShortcutCodes.includes(code)

      // Ignore inputs unless it's an app shortcut
      if (!isAppShortcut && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return

      // Alt+N: Open summon modal (new god)
      if (e.altKey && code === 'KeyN') {
        e.preventDefault()
        e.stopPropagation()
        setSummonModalOpen(true)
        return
      }

      // Alt+B: Toggle sidebar
      if (e.altKey && code === 'KeyB') {
        e.preventDefault()
        e.stopPropagation()
        handleSidebarToggle()
        return
      }

      // Alt+T: New tab
      if (e.altKey && code === 'KeyT') {
        e.preventDefault()
        e.stopPropagation()
        send({ event: 'tab:add' })
        return
      }

      // Alt+K: Kill focused entity
      if (e.altKey && code === 'KeyK') {
        e.preventDefault()
        e.stopPropagation()
        if (focusedEntity) {
          handleKillEntity(focusedEntity)
        } else if (activeEntities.length === 1) {
          handleKillEntity(activeEntities[0].id)
        }
        return
      }

      // Alt+W: Kill current tab
      if (e.altKey && code === 'KeyW') {
        e.preventDefault()
        e.stopPropagation()
        handleKillTab()
        return
      }

      // Alt+R: Spawn raw terminal
      if (e.altKey && code === 'KeyR') {
        e.preventDefault()
        e.stopPropagation()
        handleSpawnTerminal()
        return
      }

      // Alt+D: Toggle dev panel
      if (e.altKey && code === 'KeyD') {
        e.preventDefault()
        e.stopPropagation()
        toggleDevPanel()
        return
      }

      // Alt+F: Toggle window fullscreen
      if (e.altKey && code === 'KeyF') {
        e.preventDefault()
        e.stopPropagation()
        window.iris.windowControl('toggle-fullscreen')
        return
      }

      // Alt+, and Alt+.: Previous/next tab
      if (e.altKey && code === 'Comma') {
        e.preventDefault()
        e.stopPropagation()
        const idx = tabs.findIndex(t => t.id === activeTabId)
        const prevIdx = (idx - 1 + tabs.length) % tabs.length
        send({ event: 'tab:select', tabId: tabs[prevIdx].id })
        return
      }
      if (e.altKey && code === 'Period') {
        e.preventDefault()
        e.stopPropagation()
        const idx = tabs.findIndex(t => t.id === activeTabId)
        const nextIdx = (idx + 1) % tabs.length
        send({ event: 'tab:select', tabId: tabs[nextIdx].id })
        return
      }

      // Alt+1-9: Go to tab
      if (e.altKey && code.startsWith('Digit')) {
        const num = parseInt(code.charAt(5))
        if (num >= 1 && num <= 9) {
          e.preventDefault()
          e.stopPropagation()
          if (num <= tabs.length) {
            send({ event: 'tab:select', tabId: tabs[num - 1].id })
          }
          return
        }
      }

      // Escape: Clear focus
      if (e.key === 'Escape' && focusedEntity) {
        handleSetFocus(null)
      }

      // Alt+Up: Focus previous entity
      if (e.altKey && code === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        send({ event: 'focus:prev' })
        return
      }

      // Alt+Down: Focus next entity
      if (e.altKey && code === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        send({ event: 'focus:next' })
        return
      }

      // Alt+Left: Previous tab
      if (e.altKey && code === 'ArrowLeft') {
        e.preventDefault()
        e.stopPropagation()
        const t = tabsRef.current
        const a = activeTabIdRef.current
        if (t?.length > 0) {
          const idx = t.findIndex(x => x.id === a)
          const prev = (idx - 1 + t.length) % t.length
          send({ event: 'tab:select', tabId: t[prev].id })
        }
        return
      }

      // Alt+Right: Next tab
      if (e.altKey && code === 'ArrowRight') {
        e.preventDefault()
        e.stopPropagation()
        const t = tabsRef.current
        const a = activeTabIdRef.current
        if (t?.length > 0) {
          const idx = t.findIndex(x => x.id === a)
          const next = (idx + 1) % t.length
          send({ event: 'tab:select', tabId: t[next].id })
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [
    handleSpawnRandomGod, handleSpawnTerminal, handleKillEntity, handleKillTab,
    focusedEntity, activeEntities,
    toggleDevPanel, handleSetFocus, handleSidebarToggle, send, tabs, activeTabId
  ])

  // Alt key hold for shortcuts popup
  useEffect(() => {
    let altHeldTimer = null

    const handleKeyDown = (e) => {
      // Intercept bare Alt key to prevent terminal from reacting
      if (e.key === 'Alt') {
        e.preventDefault()
        // Show shortcuts when Alt is held (but not if a modal is open)
        if (!summonModalOpen && !confirmModal) {
          // Small delay to avoid flickering on Alt+key combos
          altHeldTimer = setTimeout(() => setShowShortcuts(true), 150)
        }
      } else if (e.altKey) {
        // If another key is pressed with Alt, cancel showing shortcuts
        clearTimeout(altHeldTimer)
        setShowShortcuts(false)
      }
    }

    const handleKeyUp = (e) => {
      if (e.key === 'Alt') {
        e.preventDefault()
        clearTimeout(altHeldTimer)
        setShowShortcuts(false)
      }
    }

    const handleBlur = () => {
      // Hide shortcuts if window loses focus (e.g., Alt+Tab)
      clearTimeout(altHeldTimer)
      setShowShortcuts(false)
    }

    // Use capture phase to intercept before terminal gets the event
    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', handleKeyUp, true)
    window.addEventListener('blur', handleBlur)

    return () => {
      clearTimeout(altHeldTimer)
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
      window.removeEventListener('blur', handleBlur)
    }
  }, [summonModalOpen, confirmModal])

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
        {/* Left Sidebar (Tabs + Services) */}
        <LeftSidebar
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
            <div className="flex-[2] min-w-0 relative h-full">
              <RootDropZone tabId={activeTabId} hasLayout={!!getActiveLayout()}>
              {(() => {
                const activeLayout = getActiveLayout()

                // If we have stages, render all with spring y positions (Apple-style)
                // Use activeStages (sorted by entity order) for consistent Ctrl+Up/Down navigation
                const activeTab = tabs.find(t => t.id === activeTabId)
                const activeStageId = activeTab?.activeStageId
                const foundIdx = activeStages.findIndex(s => s.id === activeStageId)
                const activeIdx = foundIdx === -1 ? 0 : foundIdx

                if (activeStages.length > 0) {
                  return (
                    <div className="relative h-full overflow-hidden">
                      {activeStages.map((stage, idx) => {
                        const offset = idx - activeIdx
                        return (
                          <motion.div
                            key={stage.id}
                            className={`absolute inset-0 stage ${offset !== 0 ? 'stage-offscreen' : ''}`}
                            initial={false}
                            animate={{ y: `${offset * 100}%`, z: 0 }}
                            transition={{ type: 'spring', stiffness: 350, damping: 32 }}
                          >
                            <Surface
                              node={stage.layout}
                              tabId={activeTabId}
                              entities={entities}
                              focusedTile={focusedTile}
                              focusedEntity={focusedEntity}
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
                    <motion.div
                      className="h-full flex flex-col items-center justify-center gap-6 text-text-secondary max-w-md mx-auto px-4"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{
                        opacity: loadStage >= 3 ? 1 : 0,
                        y: loadStage >= 3 ? 0 : 20
                      }}
                      transition={{
                        type: 'spring',
                        stiffness: 300,
                        damping: 30
                      }}
                    >
                      <div className="text-center">
                        <h1 className="text-2xl font-semibold text-text-primary mb-2">Welcome to Iris</h1>
                        <p className="text-sm opacity-70">Your voice-controlled workspace for AI assistants</p>
                      </div>

                      <div className="flex flex-col gap-3 text-sm">
                        <p className="flex items-center gap-3">
                          <kbd className="px-2 py-1 bg-bg-tertiary border border-border rounded font-mono text-xs">Alt+N</kbd>
                          <span>Summon a god</span>
                        </p>
                        <p className="flex items-center gap-3">
                          <kbd className="px-2 py-1 bg-bg-tertiary border border-border rounded font-mono text-xs">Alt+R</kbd>
                          <span>Open terminal</span>
                        </p>
                        <p className="flex items-center gap-3">
                          <kbd className="px-2 py-1 bg-bg-tertiary border border-border rounded font-mono text-xs">Alt+T</kbd>
                          <span>New realm</span>
                        </p>
                      </div>

                      <p className="text-xs opacity-50">Or drag an entity from the sidebar</p>
                    </motion.div>
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
                              {entity.type === 'personalities' && (
                                <PersonalitiesView
                                  onOpenEditor={(personality) => handleSpawnEntity('personality-editor', {
                                    name: personality.name || 'New Personality',
                                    data: { personality }
                                  })}
                                  onOpenTraitEditor={(trait) => handleSpawnEntity('trait-editor', {
                                    name: trait.name || 'New Trait',
                                    data: { trait }
                                  })}
                                />
                              )}
                              {entity.type === 'personality-editor' && (
                                <PersonalityEditor entity={entity} />
                              )}
                              {entity.type === 'trait-editor' && (
                                <TraitEditor entity={entity} />
                              )}
                              {entity.type === 'markdown' && (
                                <MarkdownView entityId={entity.id} />
                              )}
                          </TileCard>
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                )
              })()}
              </RootDropZone>
            </div>

            {/* Right Sidebar (Entity cards + Spawn buttons) */}
            <RightSidebar
              activeStages={activeStages}
              activeEntities={activeEntities}
              tabs={tabs}
              activeTabId={activeTabId}
              focusedEntity={focusedEntity}
              effectiveFocusedEntity={effectiveFocusedEntity}
              godColors={godColors}
              loadStage={loadStage}
              initialLoadDone={initialLoadDone}
              sidebarCollapsed={sidebarCollapsed}
              sidebarShowCards={sidebarShowCards}
              sidebarShowIcons={sidebarShowIcons}
              sidebarButtonsExpanded={sidebarButtonsExpanded}
              setSidebarButtonsExpanded={setSidebarButtonsExpanded}
              onSidebarToggle={handleSidebarToggle}
              onEntityClick={(entityId) => send({ event: 'focus:set', entityId })}
              onEntityClose={handleKillEntity}
              onEntitySplit={(entityId, stageId) => send({ event: 'stage:split', entityId, stageId })}
              onMoveToTab={(entityId, tabId) => {
                send({ event: 'entity:move', entityId, tabId })
                send({ event: 'tab:select', tabId })
              }}
              onMoveToNewTab={(entityId) => send({ event: 'entity:move-to-new-tab', entityId })}
              onEntityReorder={handleEntityReorder}
              onStagesReorder={(newOrder) => {
                const stageOrder = newOrder.map(s => s.id)
                send({ event: 'stages:reorder', stageOrder })
              }}
              onSpawnEntity={handleSpawnEntity}
              onSpawnTerminal={handleSpawnTerminal}
              onOpenSummonModal={() => setSummonModalOpen(true)}
            />
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
        onSummon={(name, task, personality, project) => {
          handleSummonGod(name, task, personality, project)
          setSummonModalOpen(false)
        }}
        onCancel={() => setSummonModalOpen(false)}
      />

      {/* Shortcuts popup (shown while Alt is held) */}
      <ShortcutsPopup isOpen={showShortcuts} />

      {/* Dev panel */}
      <DevPanel />
    </div>
    </DragProvider>
  )
}
