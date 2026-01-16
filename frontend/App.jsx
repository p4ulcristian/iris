import { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect, Children } from 'react'
import { useShallow } from 'zustand/react/shallow'
import TileCard from './components/TileCard'
import TerminalContent from '@entities/god/frontend/View'
import Sidebar from './components/Sidebar'
import ConfirmModal from './components/ConfirmModal'
import SummonModal from './components/SummonModal'
import ShortcutsPopup from './components/ShortcutsPopup'
import Surface from './components/Surface'
import RootDropZone from './components/RootDropZone'
import Wallpaper from './components/Wallpaper'
import { DragProvider } from './contexts/DragContext'
import { useWebSocket } from './hooks/useWebSocket'
import { useStore } from './store'
import { WS_URL } from './config'
import { setupGlobalErrorHandlers } from './utils/error-reporter'

// Animated tab slider using WAAPI (horizontal)
function TabSlider({ tabs, activeTabId, children }) {
  const ref = useRef(null)
  const animRef = useRef(null)
  const prevIndexRef = useRef(-1)

  useLayoutEffect(() => {
    if (!ref.current || tabs.length === 0) return

    const tabIndex = tabs.findIndex(t => t.id === activeTabId)
    if (tabIndex === -1) return

    const toX = -tabIndex * 100

    // First render - set position without animation
    if (prevIndexRef.current === -1) {
      ref.current.style.transform = `translateX(${toX}vw)`
      prevIndexRef.current = tabIndex
      return
    }

    // No change
    if (prevIndexRef.current === tabIndex) return

    // Cancel any running animation
    if (animRef.current) {
      try { animRef.current.cancel() } catch (e) {}
    }

    const fromX = -prevIndexRef.current * 100

    // Set final position first - animation overrides during playback, reveals this when done
    ref.current.style.transform = `translateX(${toX}vw)`

    animRef.current = ref.current.animate(
      [
        { transform: `translateX(${fromX}vw)` },
        { transform: `translateX(${toX}vw)` }
      ],
      { duration: 150, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
    )

    prevIndexRef.current = tabIndex
  }, [tabs, activeTabId])

  return (
    <div
      ref={ref}
      className="flex h-full"
      style={{ width: `${tabs.length * 100}vw` }}
    >
      {children}
    </div>
  )
}

// Animated stage slider using WAAPI (vertical) - uses vh units like TabSlider uses vw
function StageSlider({ stages, activeStageId, children }) {
  const ref = useRef(null)
  const animRef = useRef(null)
  const prevIndexRef = useRef(-1)

  useLayoutEffect(() => {
    if (!ref.current || stages.length === 0) return

    const stageIndex = stages.findIndex(s => s.stageId === activeStageId)
    const idx = stageIndex === -1 ? 0 : stageIndex
    const toY = -idx * 100

    // First render - set position without animation
    if (prevIndexRef.current === -1) {
      ref.current.style.transform = `translateY(${toY}vh)`
      prevIndexRef.current = idx
      return
    }

    if (prevIndexRef.current === idx) return

    if (animRef.current) {
      try { animRef.current.cancel() } catch (e) {}
    }

    const fromY = -prevIndexRef.current * 100
    ref.current.style.transform = `translateY(${toY}vh)`

    animRef.current = ref.current.animate(
      [
        { transform: `translateY(${fromY}vh)` },
        { transform: `translateY(${toY}vh)` }
      ],
      { duration: 150, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
    )

    prevIndexRef.current = idx
  }, [stages, activeStageId])

  return (
    <div className="h-full w-full overflow-hidden">
      <div ref={ref} className="w-full" style={{ height: `${stages.length * 100}vh` }}>
        {Children.map(children, (child) => (
          <div style={{ height: '100vh' }}>{child}</div>
        ))}
      </div>
    </div>
  )
}

export default function App() {
  const { connected, send, lastMessage } = useWebSocket(WS_URL, { trackMessages: true })

  // Get state from store - grouped selector with shallow comparison
  const {
    tabs, activeTabId, entities, focusedEntity, focusedTile, maximizedTile,
    layoutMode, initialLoadDone, theme, godColors, loadStage
  } = useStore(useShallow(s => ({
    tabs: s.tabs,
    activeTabId: s.activeTabId,
    entities: s.entities,
    focusedEntity: s.focusedEntity,
    focusedTile: s.focusedTile,
    maximizedTile: s.maximizedTile,
    layoutMode: s.layoutMode,
    initialLoadDone: s.initialLoadDone,
    theme: s.theme,
    godColors: s.godColors,
    loadStage: s.loadStage
  })))

  // Get actions from store - these are stable references, single selector
  const actions = useStore(useShallow(s => ({
    setConnected: s.setConnected,
    setInitialLoadDone: s.setInitialLoadDone,
    getActiveEntities: s.getActiveEntities,
    getActiveGods: s.getActiveGods,
    getEntitiesForTab: s.getEntitiesForTab,
    getGodsForTab: s.getGodsForTab,
    getAllGodNames: s.getAllGodNames,
    getAllGods: s.getAllGods,
    getAllEntities: s.getAllEntities,
    syncState: s.syncState,
    triggerStagedReveal: s.triggerStagedReveal,
    getActiveLayout: s.getActiveLayout
  })))

  const {
    setConnected, setInitialLoadDone, getActiveEntities, getActiveGods,
    getEntitiesForTab, getGodsForTab, getAllGodNames, getAllGods,
    getAllEntities, syncState, triggerStagedReveal, getActiveLayout
  } = actions

  const [confirmModal, setConfirmModal] = useState(null)
  const [summonModalType, setSummonModalType] = useState(null) // null = closed, 'god'
  const [showShortcuts, setShowShortcuts] = useState(false)

  // Sidebar width state with localStorage persistence
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('iris:sidebar-width')
    return saved ? parseInt(saved) : 288
  })

  const handleSidebarResize = useCallback((width) => {
    setSidebarWidth(width)
    localStorage.setItem('iris:sidebar-width', width.toString())
  }, [])

  // Sync sidebar width to CSS variable for maximized tiles
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}px`)
  }, [sidebarWidth])

  const mainContainerRef = useRef(null)


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
        const t0 = performance.now()
        const latency = data._serverTime ? Date.now() - data._serverTime : null
        const isFirstLoad = !initialLoadDone
        syncState(data)
        console.log(`[App] state:sync processed in ${(performance.now() - t0).toFixed(1)}ms, latency: ${latency}ms`)
        setInitialLoadDone(true)
        // Trigger staged reveal animation on first load
        if (isFirstLoad) {
          triggerStagedReveal()
        }
        break
      }

      case 'services:status':
        // Services status is just a partial sync
        syncState({
          services: data.services,
          chronicleDetails: data.chronicleDetails || null
        })
        break

      case 'system-claude:status':
        // System Claude processes update
        syncState({ systemClaudes: data.processes || [] })
        break

      case 'chronicle:line':
        // Dispatch event for ChronicleButton to handle
        window.dispatchEvent(new CustomEvent('iris:chronicle:line', { detail: data.line }))
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
  // Uses server's stage order (no sorting - matches visual display)
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
    })
  }, [tabs, entities, collectEntityIds])

  // Build flat list of ALL stages across ALL tabs
  const allStages = useMemo(() => {
    const stages = []
    tabs.forEach((tab) => {
      const tabStages = getStagesForTab(tab.id)
      if (tabStages.length > 0) {
        tabStages.forEach((stage) => {
          stages.push({ tab, stage, tabId: tab.id, stageId: stage.id })
        })
      } else {
        stages.push({ tab, stage: null, tabId: tab.id, stageId: null, isEmpty: true })
      }
    })
    return stages
  }, [tabs, getStagesForTab])

  // Get focused entity object
  const focusedEntityObj = focusedEntity ? entities[focusedEntity] : null
  const focusedEntityType = focusedEntityObj?.type || 'god'

  // Smart split: choose direction based on focused tile aspect ratio
  const getSmartDirection = useCallback(() => {
    if (!focusedTile) return 'horizontal'
    const el = document.querySelector(`[data-tile-id="${focusedTile}"]`)
    if (!el) return 'horizontal'
    const { width, height } = el.getBoundingClientRect()
    return width >= height ? 'horizontal' : 'vertical'
  }, [focusedTile])

  // Summon a new god (with specific name)
  // Server handles all state - no optimistic UI needed
  // mode: 'split' (default) or 'stage', direction: 'horizontal' (default) or 'vertical'
  const handleSummonGod = useCallback((name, task = '', personality = 'god', project = null, permissionMode, event = null) => {
    // Detect modifier keys if event provided
    const mode = event?.ctrlKey || event?.metaKey ? 'stage' : 'split'
    const direction = event?.shiftKey ? 'vertical' : getSmartDirection()

    send({
      event: 'god:spawn',
      name,
      task,
      personality,
      permissionMode,
      project,
      mode,
      direction
    })
  }, [send, getSmartDirection])

  // Spawn a random god (server picks unused first, then numbers)
  const handleSpawnRandomGod = useCallback((event = null) => {
    const mode = event?.ctrlKey || event?.metaKey ? 'stage' : 'split'
    const direction = event?.shiftKey ? 'vertical' : getSmartDirection()
    send({ event: 'god:spawn', task: '', mode, direction })
  }, [send, getSmartDirection])

  // Spawn a raw terminal (no Claude)
  const handleSpawnTerminal = useCallback((event = null) => {
    const mode = event?.ctrlKey || event?.metaKey ? 'stage' : 'split'
    const direction = event?.shiftKey ? 'vertical' : getSmartDirection()
    send({
      event: 'terminal:spawn',
      mode,
      direction
    })
  }, [send, getSmartDirection])

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
  // mode: 'split' (default) or 'stage'
  // direction: 'horizontal' (default) or 'vertical'
  const handleSpawnEntity = useCallback((type, data = {}, event = null) => {
    // Detect modifier keys if event provided
    const mode = event?.ctrlKey || event?.metaKey ? 'stage' : (data.mode || 'split')
    const direction = event?.shiftKey ? 'vertical' : (data.direction || getSmartDirection())

    // god and terminal have their own spawn events
    const eventName = type === 'terminal' ? 'terminal:spawn'
      : type === 'god' ? 'god:spawn'
      : 'entity:spawn'
    send({ event: eventName, type, ...data, mode, direction })
  }, [send, getSmartDirection])

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

      // Cmd+N (Mac) / Alt+N: Open summon modal
      if (isModifierPressed(e) && code === 'KeyN') {
        e.preventDefault()
        e.stopPropagation()
        setSummonModalType('god')
        return
      }

      // Cmd+T (Mac) / Alt+T: New tab
      if (isModifierPressed(e) && code === 'KeyT') {
        e.preventDefault()
        e.stopPropagation()
        send({ event: 'tab:add' })
        return
      }

      // Cmd+K (Mac) / Alt+K: Kill hovered/focused entity
      if (isModifierPressed(e) && code === 'KeyK') {
        e.preventDefault()
        e.stopPropagation()
        // Let server decide target - it tracks hover state accurately
        send({ event: 'entity:kill-hovered' })
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

      // Ctrl+F or Cmd+F (Mac) / Alt+F: Toggle focused pane maximize (within stage)
      if ((e.ctrlKey && !e.metaKey && !e.altKey && code === 'KeyF') ||
          (isModifierPressed(e) && code === 'KeyF')) {
        e.preventDefault()
        e.stopPropagation()
        send({ event: 'layout:toggle-maximize' })
        return
      }

      // Cmd+, (Mac) / Alt+,: Previous tab
      if (isModifierPressed(e) && code === 'Comma') {
        e.preventDefault()
        e.stopPropagation()
        send({ event: 'tab:prev' })
        return
      }

      // Cmd+. (Mac) / Alt+.: Next tab
      if (isModifierPressed(e) && code === 'Period') {
        e.preventDefault()
        e.stopPropagation()
        send({ event: 'tab:next' })
        return
      }

      // Cmd+1-9 (Mac) / Alt+1-9: Go to tab
      if (isModifierPressed(e) && code.startsWith('Digit')) {
        const num = parseInt(code.charAt(5))
        if (num >= 1 && num <= 9) {
          e.preventDefault()
          e.stopPropagation()
          send({ event: 'tab:goto', index: num - 1 })
          return
        }
      }

      // Escape: Clear focus (only when terminal isn't focused - let Escape pass through to terminal apps)
      if (e.key === 'Escape') {
        const isTerminalFocused = document.activeElement?.closest('.entity-content')
        if (!isTerminalFocused) {
          send({ event: 'focus:clear' })
        }
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
        send({ event: 'tab:prev' })
        return
      }

      // Cmd+Right (Mac) / Alt+Right: Next tab
      if (isModifierPressed(e) && code === 'ArrowRight') {
        e.preventDefault()
        e.stopPropagation()
        send({ event: 'tab:next' })
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [handleSpawnRandomGod, handleSpawnTerminal, handleKillEntity, handleKillTab, send])

  // Modifier key hold for shortcuts popup (Cmd on Mac, Alt on others)
  useEffect(() => {
    const isMacOS = /Mac|iPhone|iPad|iPod/.test(navigator.platform)
    let modifierHeldTimer = null

    const handleKeyDown = (e) => {
      // Intercept bare modifier key to prevent terminal from reacting
      if ((isMacOS && e.key === 'Meta') || (!isMacOS && e.key === 'Alt')) {
        e.preventDefault()
        // Show shortcuts when modifier is held (but not if a modal is open)
        if (!summonModalType && !confirmModal) {
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
  }, [summonModalType, confirmModal])

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
      {/* Animated wallpaper - reactive glass background */}
      <Wallpaper />

      {/* Main layout: horizontal sliding tabs */}
      <div ref={mainContainerRef} className="flex-1 min-h-0 overflow-hidden">
        <TabSlider tabs={tabs} activeTabId={activeTabId}>
          {tabs.map((tab) => {
            const isActiveTab = tab.id === activeTabId
            const tabStages = allStages.filter(item => item.tabId === tab.id)

            return (
              <div
                key={tab.id}
                className="flex h-full pr-3"
                style={{ width: '100vw', pointerEvents: isActiveTab ? 'auto' : 'none' }}
              >
                {/* Sidebar for this tab */}
                <Sidebar
                  connected={connected}
                  send={send}
                  tabs={tabs}
                  activeTabId={activeTabId}
                  currentTab={tab}
                  onTabSelect={(tabId) => send({ event: 'tab:select', tabId })}
                  onTabClose={handleKillTab}
                  onTabNew={() => send({ event: 'tab:add' })}
                  tabStages={tabStages}
                  focusedEntity={focusedEntity}
                  loadStage={loadStage}
                  initialLoadDone={initialLoadDone}
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
                  onOpenSummonModal={(type = 'god') => setSummonModalType(type)}
                  width={sidebarWidth}
                  onWidthChange={handleSidebarResize}
                />

                {/* Stage for this tab */}
                <main className="flex-1 min-h-0 overflow-hidden relative">
                  <RootDropZone tabId={tab.id} hasLayout={!!tab.stages?.length}>
                    {(() => {
                      // Filter same as sidebar to ensure matching indices
                      const nonEmptyStages = tabStages.filter(item => !item.isEmpty)

                      if (nonEmptyStages.length === 0) {
                        // Welcome screen when no stages
                        return (
                          <div className="h-full flex flex-col items-center justify-center gap-6 text-text-secondary max-w-md mx-auto px-4">
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
                          </div>
                        )
                      }

                      return (
                        <div className="absolute inset-0">
                          <StageSlider stages={nonEmptyStages} activeStageId={tab.activeStageId}>
                            {nonEmptyStages.map((stageItem) => (
                              <div
                                key={stageItem.stageId}
                                className="w-full h-full py-3"
                              >
                                <Surface
                                  node={stageItem.stage.layout}
                                  tabId={tab.id}
                                  entities={entities}
                                  focusedTile={focusedTile}
                                  focusedEntity={focusedEntity}
                                  maximizedTile={maximizedTile}
                                />
                              </div>
                            ))}
                          </StageSlider>
                        </div>
                      )
                    })()}
                  </RootDropZone>
                </main>
              </div>
            )
          })}
        </TabSlider>
      </div>

      {/* Hidden gods container - keeps terminals alive when on other tabs */}
      <div className="fixed -left-[9999px] -top-[9999px] w-[800px] h-[600px] overflow-hidden pointer-events-none" aria-hidden="true">
        {hiddenGods.map(god => (
          <div key={god.id} className="w-full h-full">
            <TileCard entity={god} isFocused={false}>
              <TerminalContent
                entity={god}
                isFocused={false}
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
        isOpen={!!summonModalType}
        onSummon={(name, task, personality, project, permissionMode, event) => {
          handleSummonGod(name, task, personality, project, permissionMode, event)
          setSummonModalType(null)
        }}
        onCancel={() => setSummonModalType(null)}
      />

      {/* Shortcuts popup (shown while Alt is held) */}
      <ShortcutsPopup
        isOpen={showShortcuts}
        onSpawnEntity={handleSpawnEntity}
        onOpenSummonModal={(type = 'god') => setSummonModalType(type)}
      />
    </div>
    </DragProvider>
  )
}
