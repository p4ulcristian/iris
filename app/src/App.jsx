import { useState, useEffect, useCallback } from 'react'
import { Reorder, AnimatePresence, motion } from 'framer-motion'
import TabBar from './components/TabBar'
import GodCard from './components/GodCard'
import GodTaskCard from './components/GodTaskCard'
import StatusBar from './components/StatusBar'
import ConfirmModal from './components/ConfirmModal'
import EntityPickerModal from './components/EntityPickerModal'
import DevPanel from './components/DevPanel'
import HistoryView from './components/HistoryView'
import BrowserView from './components/BrowserView'
import GitView from './components/GitView'
import LinearView from './components/LinearView'
import SettingsView from './components/SettingsView'
import { useWebSocket } from './hooks/useWebSocket'
import { useStore } from './store'
import { withViewTransition } from './hooks/useViewTransition'
import { WS_URL } from './config'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUserPlus, faTerminal, faCode } from '@fortawesome/free-solid-svg-icons'

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
  const [entityPickerOpen, setEntityPickerOpen] = useState(false)

  // Update connection status in store
  useEffect(() => {
    setConnected(connected)
  }, [connected, setConnected])

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

  // Summon a new god
  const handleSummonGod = useCallback((name, task = '') => {
    send({
      event: 'god:spawn',
      name,
      task
    })
    setEntityPickerOpen(false)
  }, [send])

  // Spawn a raw terminal (no Claude)
  const handleSpawnTerminal = useCallback(() => {
    send({
      event: 'terminal:spawn'
    })
  }, [send])

  // Kill an entity (with confirmation for gods/terminals)
  const handleKillEntity = useCallback((entityId) => {
    const entity = entities[entityId]
    const isGodOrTerminal = entity?.type === 'god' || entity?.type === 'terminal'
    const displayName = entity?.name || entityId

    if (isGodOrTerminal) {
      setConfirmModal({
        title: `Banish ${displayName}?`,
        message: 'This will terminate the session.',
        confirmText: 'Banish',
        danger: true,
        onConfirm: () => {
          send({ event: 'entity:kill', entityId })
          setConfirmModal(null)
        }
      })
    } else {
      // View entities can be closed without confirmation
      send({ event: 'entity:kill', entityId })
    }
  }, [send, entities])

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

  // Kill current tab (with confirmation)
  const handleKillTab = useCallback((tabId = activeTabId) => {
    const tab = tabs.find(t => t.id === tabId)
    if (!tab) return

    const tabEntities = getEntitiesForTab(tabId)

    if (tabs.length === 1 && tabEntities.length === 0) {
      return // Don't close last empty tab
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
        (e.ctrlKey && ['n', 'k', 'f', 'l', 'd', 'r'].includes(key)) ||
        (e.altKey && (['n', 'k', ',', '.'].includes(key) || (e.key >= '1' && e.key <= '9')))
      )

      // Ignore inputs unless it's an app shortcut
      if (!isAppShortcut && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return

      // Ctrl+N: Open entity picker modal
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault()
        e.stopPropagation()
        setEntityPickerOpen(true)
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
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [
    handleSpawnTerminal, handleKillEntity, handleKillTab, handleToggleFullscreen,
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
    if (position === 0) {
      return { x: '0%', opacity: 1, zIndex: 10, pointerEvents: 'auto' }
    }
    if (position < 0) {
      return { x: '-100%', opacity: 0, zIndex: 0, pointerEvents: 'none' }
    }
    return { x: '100%', opacity: 0, zIndex: 0, pointerEvents: 'none' }
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

      {/* Tab bar */}
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={(tabId) => send({ event: 'tab:select', tabId })}
        onClose={handleKillTab}
        onNew={() => send({ event: 'tab:add' })}
        onOpenSummon={() => setEntityPickerOpen(true)}
        connected={connected}
        getEntitiesForTab={getEntitiesForTab}
      />

      {/* Main content area */}
      <main className="flex-1 min-h-0 overflow-visible p-4">
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
          <div className="flex gap-4 h-full">
            {/* Main focused entity area */}
            <div className="flex-[2] min-w-0 relative">
              {/* Render based on focused entity type */}
              {(effectiveFocusedType === 'god' || effectiveFocusedType === 'terminal') && (
                /* God/Terminal: stack animation with terminals */
                activeGods.filter(g => g.tabId === activeTabId).map(god => {
                  const position = getStackPosition(god.id, effectiveFocusedEntity, activeGods.filter(g => g.tabId === activeTabId))
                  const style = getStackStyle(position)

                  return (
                    <motion.div
                      key={god.id}
                      className="absolute inset-0"
                      animate={{
                        x: style.x,
                        opacity: style.opacity,
                        zIndex: style.zIndex,
                      }}
                      transition={{
                        type: 'spring',
                        stiffness: 500,
                        damping: 35,
                      }}
                      style={{ pointerEvents: style.pointerEvents }}
                    >
                      <GodCard
                        god={god}
                        isFocused={position === 0}
                        onFocus={() => handleSetFocus(god.id)}
                        onDoubleClick={() => {}}
                      />
                    </motion.div>
                  )
                })
              )}

              {effectiveFocusedType === 'browser' && (
                <div className="h-full relative">
                  <BrowserView entityId={effectiveFocusedEntity} />
                </div>
              )}

              {effectiveFocusedType === 'history' && (
                <HistoryView send={send} />
              )}

              {effectiveFocusedType === 'git' && (
                <GitView send={send} />
              )}

              {effectiveFocusedType === 'linear' && (
                <LinearView send={send} />
              )}

              {effectiveFocusedType === 'settings' && (
                <SettingsView send={send} />
              )}
            </div>

            {/* Sidebar with all entities as task cards */}
            <div className="w-80 flex flex-col overflow-y-auto overflow-x-visible">
              <Reorder.Group
                axis="y"
                values={activeEntities}
                onReorder={handleEntityReorder}
                className="flex flex-col gap-4"
              >
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
              </Reorder.Group>
              {/* Action buttons */}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setEntityPickerOpen(true)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-black/40 border border-white/20 text-white/80 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
                  title="Add entity (Ctrl+N)"
                >
                  <FontAwesomeIcon icon={faUserPlus} />
                </button>
                <button
                  onClick={handleSpawnTerminal}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-black/40 border border-white/20 text-white/80 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
                  title="New terminal (Ctrl+R)"
                >
                  <FontAwesomeIcon icon={faTerminal} />
                </button>
                <button
                  onClick={() => send({ event: 'nvim:spawn' })}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-black/40 border border-white/20 text-white/80 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
                  title="New nvim"
                >
                  <FontAwesomeIcon icon={faCode} />
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Hidden gods container - keeps terminals alive when on other tabs */}
      <div className="fixed -left-[9999px] -top-[9999px] w-[800px] h-[600px] overflow-hidden pointer-events-none" aria-hidden="true">
        {hiddenGods.map(god => (
          <div key={god.id} className="w-full h-full">
            <GodCard
              god={god}
              isFocused={false}
              isHidden={true}
              onFocus={() => {}}
              onDoubleClick={() => {}}
            />
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

      {/* Entity picker modal */}
      <EntityPickerModal
        isOpen={entityPickerOpen}
        usedGodNames={getAllGodNames()}
        onSpawnGod={handleSummonGod}
        onSpawnEntity={handleSpawnEntity}
        onCancel={() => setEntityPickerOpen(false)}
      />

      {/* Status bar */}
      <StatusBar connected={connected} send={send} />

      {/* Dev panel */}
      <DevPanel />
    </div>
  )
}
