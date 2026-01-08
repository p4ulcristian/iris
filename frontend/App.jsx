import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import TileCard from './components/TileCard'
import TerminalContent from '@entities/god/frontend/View'
import LeftSidebar from './components/LeftSidebar'
import RightSidebar from './components/RightSidebar'
import ConfirmModal from './components/ConfirmModal'
import SummonModal from './components/SummonModal'
import ShortcutsPopup from './components/ShortcutsPopup'
import HistoryView from '@entities/history/frontend/View'
import BrowserView from '@entities/browser/frontend/View'
import GitView from '@entities/git/frontend/View'
import LinearView from '@entities/linear/frontend/View'
import SettingsView from '@entities/settings/frontend/View'
import CemeteryView from '@entities/cemetery/frontend/View'
import CalendarView from '@entities/calendar/frontend/View'
import CodeView from '@entities/code/frontend/View'
import PersonalitiesView from '@entities/personalities/frontend/View'
import PersonalityEditor from '@entities/personalities/frontend/PersonalityEditor'
import TraitEditor from '@entities/personalities/frontend/TraitEditor'
import MarkdownView from '@entities/markdown/frontend/View'
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
  const setConnected = useStore(s => s.setConnected)
  const setInitialLoadDone = useStore(s => s.setInitialLoadDone)
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
        const isFirstLoad = !initialLoadDone
        syncState(data)
        setInitialLoadDone(true)
        // Trigger staged reveal animation on first load
        if (isFirstLoad) {
          triggerStagedReveal()
        }
        break
      }

      case 'services:status':
        // Services status is just a partial sync
        syncState({ services: data.services })
        break

      // Entity status updates come through state:sync now
      case 'entity:set-status':
      case 'god:set-status':
        // Ignored - server broadcasts state:sync for these
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
        // Server now handles failure state via state:sync
        // Just log and notify
        console.error(`⛔ God spawn failed: ${data.godName}`, data.error)
        if (window.Notification?.permission === 'granted') {
          new Notification('Spawn Failed', {
            body: data.error || `Failed to summon ${data.godName}`,
            icon: '/icon.png'
          })
        }
        break
      }

      case 'warning':
        console.warn(`⚠️ ${data.message}`, data.hint ? `\n   ${data.hint}` : '')
        break
    }
  }, [lastMessage, syncState, setInitialLoadDone, focusedEntity, initialLoadDone, triggerStagedReveal])

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

  // Get stages for any tab with their entities (grouped by stage)
  // Sorted by first entity's order so Ctrl+Up/Down matches visual order
  const getStagesForTab = useCallback((tabId) => {
    const tab = tabs.find(t => t.id === tabId)
    const stages = tab?.stages || []
    return stages.map(stage => {
      const entityIds = collectEntityIds(stage.layout)
      return {
        ...stage,
        entities: entityIds
          .map(id => entities[id])
          .filter(Boolean)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      }
    }).sort((a, b) => {
      const aOrder = a.entities[0]?.order ?? Infinity
      const bOrder = b.entities[0]?.order ?? Infinity
      return aOrder - bOrder
    })
  }, [tabs, entities, collectEntityIds])

  // Active tab's stages (for backwards compat with sidebar etc)
  const activeStages = useMemo(() => {
    return getStagesForTab(activeTabId)
  }, [getStagesForTab, activeTabId])

  // Build flat list of ALL stages across ALL tabs for continuous scroll animation
  const { allStages, globalActiveIdx } = useMemo(() => {
    const stages = []
    let activeIdx = 0

    tabs.forEach((tab) => {
      const tabStages = getStagesForTab(tab.id)
      const activeStageId = tab.activeStageId

      if (tabStages.length > 0) {
        tabStages.forEach((stage, stageIdx) => {
          if (tab.id === activeTabId) {
            const foundIdx = tabStages.findIndex(s => s.id === activeStageId)
            const activeStageIdx = foundIdx === -1 ? 0 : foundIdx
            if (stageIdx === activeStageIdx) {
              activeIdx = stages.length
            }
          }
          stages.push({ tab, stage, tabId: tab.id, stageId: stage.id })
        })
      } else {
        if (tab.id === activeTabId) {
          activeIdx = stages.length
        }
        stages.push({ tab, stage: null, tabId: tab.id, stageId: null, isEmpty: true })
      }
    })

    return { allStages: stages, globalActiveIdx: activeIdx }
  }, [tabs, activeTabId, getStagesForTab])

  // Get focused entity object
  const focusedEntityObj = focusedEntity ? entities[focusedEntity] : null
  const focusedEntityType = focusedEntityObj?.type || 'god'


  // Summon a new god (with specific name)
  // Server handles all state - no optimistic UI needed
  const handleSummonGod = useCallback((name, task = '', personality = 'god', project = null) => {
    send({
      event: 'god:spawn',
      name,
      task,
      personality,
      project
    })
  }, [send])

  // Spawn a random available god
  const handleSpawnRandomGod = useCallback(() => {
    const allGods = Object.keys(godColors)
    if (allGods.length === 0) return // Not loaded yet
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
    // Detect if we're on macOS
    const isMacOS = /Mac|iPhone|iPad|iPod/.test(navigator.platform)

    // Helper to check if the modifier key is pressed (Cmd on Mac, Alt on others)
    const isModifierPressed = (e) => isMacOS ? e.metaKey : e.altKey

    const handleKeyDown = (e) => {
      // Use e.code for physical key detection (works with Mac Option key)
      // On Mac, Option+letter produces special chars (e.g., Option+N = ñ)
      // but e.code still gives us "KeyN"
      const code = e.code

      // Check if this is one of our app shortcuts (Cmd-based on Mac, Alt on others)
      const appShortcutCodes = [
        'KeyN', 'KeyT', 'KeyW', 'KeyK', 'KeyR', 'KeyB', 'KeyF',
        'Comma', 'Period', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
        'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'
      ]
      const isAppShortcut = isModifierPressed(e) && appShortcutCodes.includes(code)

      // Shift+Arrow/PageUp/PageDown: Scroll focused terminal (check before input filter)
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const scrollKeys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown']
        if (scrollKeys.includes(e.key)) {
          e.preventDefault()
          e.stopPropagation()
          window.dispatchEvent(new CustomEvent('iris:scroll-terminal', {
            detail: { key: e.key }
          }))
          return
        }
      }

      // Ignore inputs unless it's an app shortcut
      if (!isAppShortcut && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return

      // Cmd+N (Mac) / Alt+N: Open summon modal (new god)
      if (isModifierPressed(e) && code === 'KeyN') {
        e.preventDefault()
        e.stopPropagation()
        setSummonModalOpen(true)
        return
      }

      // Cmd+B (Mac) / Alt+B: Toggle sidebar
      if (isModifierPressed(e) && code === 'KeyB') {
        e.preventDefault()
        e.stopPropagation()
        handleSidebarToggle()
        return
      }

      // Cmd+T (Mac) / Alt+T: New tab
      if (isModifierPressed(e) && code === 'KeyT') {
        e.preventDefault()
        e.stopPropagation()
        send({ event: 'tab:add' })
        return
      }

      // Cmd+K (Mac) / Alt+K: Kill focused entity
      if (isModifierPressed(e) && code === 'KeyK') {
        e.preventDefault()
        e.stopPropagation()
        if (focusedEntity) {
          handleKillEntity(focusedEntity)
        } else if (activeEntities.length === 1) {
          handleKillEntity(activeEntities[0].id)
        }
        return
      }

      // Cmd+W (Mac) / Alt+W: Kill current tab
      if (isModifierPressed(e) && code === 'KeyW') {
        e.preventDefault()
        e.stopPropagation()
        handleKillTab()
        return
      }

      // Cmd+R (Mac) / Alt+R: Spawn raw terminal
      if (isModifierPressed(e) && code === 'KeyR') {
        e.preventDefault()
        e.stopPropagation()
        handleSpawnTerminal()
        return
      }

      // Cmd+F (Mac) / Alt+F: Toggle window fullscreen
      if (isModifierPressed(e) && code === 'KeyF') {
        e.preventDefault()
        e.stopPropagation()
        window.iris.windowControl('toggle-fullscreen')
        return
      }

      // Cmd+, (Mac) / Alt+,: Previous tab
      if (isModifierPressed(e) && code === 'Comma') {
        e.preventDefault()
        e.stopPropagation()
        const idx = tabs.findIndex(t => t.id === activeTabId)
        const prevIdx = (idx - 1 + tabs.length) % tabs.length
        send({ event: 'tab:select', tabId: tabs[prevIdx].id })
        return
      }

      // Cmd+. (Mac) / Alt+.: Next tab
      if (isModifierPressed(e) && code === 'Period') {
        e.preventDefault()
        e.stopPropagation()
        const idx = tabs.findIndex(t => t.id === activeTabId)
        const nextIdx = (idx + 1) % tabs.length
        send({ event: 'tab:select', tabId: tabs[nextIdx].id })
        return
      }

      // Cmd+1-9 (Mac) / Alt+1-9: Go to tab
      if (isModifierPressed(e) && code.startsWith('Digit')) {
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

      // Cmd+Up (Mac) / Alt+Up: Focus previous entity
      if (isModifierPressed(e) && code === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        send({ event: 'focus:prev' })
        return
      }

      // Cmd+Down (Mac) / Alt+Down: Focus next entity
      if (isModifierPressed(e) && code === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        send({ event: 'focus:next' })
        return
      }

      // Cmd+Left (Mac) / Alt+Left: Previous tab
      if (isModifierPressed(e) && code === 'ArrowLeft') {
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

      // Cmd+Right (Mac) / Alt+Right: Next tab
      if (isModifierPressed(e) && code === 'ArrowRight') {
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
    handleSetFocus, handleSidebarToggle, send, tabs, activeTabId
  ])

  // Modifier key hold for shortcuts popup (Cmd on Mac, Alt on others)
  useEffect(() => {
    const isMacOS = /Mac|iPhone|iPad|iPod/.test(navigator.platform)
    let modifierHeldTimer = null

    const handleKeyDown = (e) => {
      // Intercept bare modifier key to prevent terminal from reacting
      if ((isMacOS && e.key === 'Meta') || (!isMacOS && e.key === 'Alt')) {
        e.preventDefault()
        // Show shortcuts when modifier is held (but not if a modal is open)
        if (!summonModalOpen && !confirmModal) {
          // Small delay to avoid flickering on modifier+key combos
          modifierHeldTimer = setTimeout(() => setShowShortcuts(true), 150)
        }
      } else if ((isMacOS && e.metaKey) || (!isMacOS && e.altKey)) {
        // If another key is pressed with modifier, cancel showing shortcuts
        clearTimeout(modifierHeldTimer)
        setShowShortcuts(false)
      }
    }

    const handleKeyUp = (e) => {
      if ((isMacOS && e.key === 'Meta') || (!isMacOS && e.key === 'Alt')) {
        e.preventDefault()
        clearTimeout(modifierHeldTimer)
        setShowShortcuts(false)
      }
    }

    const handleBlur = () => {
      // Hide shortcuts if window loses focus (e.g., Cmd+Tab on Mac, Alt+Tab on others)
      clearTimeout(modifierHeldTimer)
      setShowShortcuts(false)
    }

    // Use capture phase to intercept before terminal gets the event
    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', handleKeyUp, true)
    window.addEventListener('blur', handleBlur)

    return () => {
      clearTimeout(modifierHeldTimer)
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
                // Use memoized allStages and globalActiveIdx for continuous scroll
                if (allStages.length > 0) {
                  return (
                    <div className="relative h-full overflow-hidden">
                      {/* Render ALL stages from ALL tabs as one continuous stack */}
                      {allStages.map((item, idx) => {
                        const offset = idx - globalActiveIdx
                        const isActive = offset === 0

                        return (
                          <motion.div
                            key={item.stageId || `empty-${item.tabId}`}
                            className={`absolute inset-0 stage ${offset !== 0 ? 'stage-offscreen' : ''}`}
                            initial={false}
                            animate={{ y: `${offset * 100}%` }}
                            transition={{ type: 'spring', stiffness: 350, damping: 32 }}
                            style={{ pointerEvents: isActive ? 'auto' : 'none' }}
                            onAnimationComplete={() => {
                              // Notify terminals to recalculate after animation
                              window.dispatchEvent(new CustomEvent('iris:animation-complete'))
                            }}
                          >
                            {item.isEmpty ? (
                              // Empty tab welcome screen
                              <motion.div
                                className="h-full flex flex-col items-center justify-center gap-6 text-text-secondary max-w-md mx-auto px-4"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 20 }}
                                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
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
                            ) : (
                              <Surface
                                node={item.stage.layout}
                                tabId={item.tabId}
                                entities={entities}
                                focusedTile={focusedTile}
                                focusedEntity={focusedEntity}
                              />
                            )}
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
                          onAnimationComplete={() => {
                            window.dispatchEvent(new CustomEvent('iris:animation-complete'))
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
              allStages={allStages}
              globalActiveIdx={globalActiveIdx}
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
              onReorderInStage={(stageId, entityId, targetIndex) => {
                send({ event: 'stage:reorder-entity', stageId, entityId, targetIndex })
              }}
              onJoinStage={(entityId, sourceStageId, targetStageId, targetIndex) => {
                send({ event: 'stage:join', entityId, sourceStageId, targetStageId, targetIndex })
              }}
              onCreateStageAtPosition={(entityId, sourceStageId, position) => {
                send({ event: 'stage:create-at-position', entityId, sourceStageId, position })
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
    </div>
    </DragProvider>
  )
}
