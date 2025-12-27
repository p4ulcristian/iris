import { useState, useEffect, useCallback } from 'react'
import { Reorder, AnimatePresence, motion } from 'framer-motion'
import TabBar from './components/TabBar'
import GodCard from './components/GodCard'
import GodTaskCard from './components/GodTaskCard'
import StatusBar from './components/StatusBar'
import ConfirmModal from './components/ConfirmModal'
import SummonModal from './components/SummonModal'
import DevPanel from './components/DevPanel'
import HistoryView from './components/HistoryView'
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
  const gods = useStore(s => s.gods)
  const focusedGod = useStore(s => s.focusedGod)
  const fullscreenGod = useStore(s => s.fullscreenGod)
  const layoutMode = useStore(s => s.layoutMode)
  const view = useStore(s => s.view)
  const workLayout = useStore(s => s.workLayout)
  const initialLoadDone = useStore(s => s.initialLoadDone)
  const theme = useStore(s => s.theme)

  // Actions (local UI state only - fullscreen and layoutMode are still client-only)
  const updateGodStatus = useStore(s => s.updateGodStatus)
  const toggleFullscreen = useStore(s => s.toggleFullscreen)
  const rotateLayout = useStore(s => s.rotateLayout)
  const setConnected = useStore(s => s.setConnected)
  const setInitialLoadDone = useStore(s => s.setInitialLoadDone)
  const setServices = useStore(s => s.setServices)
  const toggleDevPanel = useStore(s => s.toggleDevPanel)
  const getActiveGods = useStore(s => s.getActiveGods)
  const getGodsForTab = useStore(s => s.getGodsForTab)
  const getAllGodNames = useStore(s => s.getAllGodNames)
  const getAllGods = useStore(s => s.getAllGods)
  const syncState = useStore(s => s.syncState)

  const [confirmModal, setConfirmModal] = useState(null)
  const [summonModalOpen, setSummonModalOpen] = useState(false)

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
        // Check if view, workLayout or focusedGod is changing - trigger view transition
        const viewChanging = data.view !== view || data.workLayout !== workLayout || data.focusedGod !== focusedGod

        const doSync = () => {
          syncState(data)
          if (data.services) {
            setServices(data.services)
          }
          setInitialLoadDone(true)
        }

        if (viewChanging && initialLoadDone) {
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

      case 'god:status':
        updateGodStatus(data.godName || data.name, data.status)
        break
    }
  }, [lastMessage, syncState, updateGodStatus, setInitialLoadDone, setServices, view, workLayout, focusedGod, initialLoadDone])

  // Get gods for active tab
  const activeGods = getActiveGods()

  // Dispatch refit event when god count changes (for terminal resizing)
  useEffect(() => {
    // Small delay to let layout settle
    const timeout = setTimeout(() => {
      window.dispatchEvent(new Event('iris:refit'))
    }, 100)
    return () => clearTimeout(timeout)
  }, [activeGods.length])

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
  const handleSummon = useCallback((name, task = '') => {
    send({
      event: 'god:spawn',
      name,
      task
    })
    setSummonModalOpen(false)
  }, [send])

  // Spawn a raw terminal (no Claude)
  const handleSpawnTerminal = useCallback(() => {
    send({
      event: 'terminal:spawn'
    })
  }, [send])

  // Kill a god (with confirmation)
  const handleKillGod = useCallback((godName) => {
    setConfirmModal({
      title: `Banish ${godName}?`,
      message: 'This will terminate the god session.',
      confirmText: 'Banish',
      danger: true,
      onConfirm: () => {
        send({ event: 'god:kill', godName })
        setConfirmModal(null)
      }
    })
  }, [send])

  // Enter focus mode for a god
  const handleEnterFocus = useCallback((godName) => {
    send({ event: 'workLayout:set', layout: 'focus', focusedGod: godName })
  }, [send])

  // Exit focus mode
  const handleExitFocus = useCallback(() => {
    send({ event: 'workLayout:set', layout: 'grid' })
  }, [send])

  // Change main view
  const handleViewChange = useCallback((newView) => {
    send({ event: 'view:set', view: newView })
  }, [send])

  // Set focused god (server event)
  const handleSetFocus = useCallback((godName) => {
    send({ event: 'focus:set', godName })
  }, [send])

  // Reorder gods via drag and drop
  const handleGodReorder = useCallback((newOrder) => {
    // newOrder is array of god objects, extract names in new order
    const orderedNames = newOrder.map(g => g.name)
    send({ event: 'gods:reorder', order: orderedNames })
  }, [send])

  // Toggle fullscreen with view transition
  const handleToggleFullscreen = useCallback((godName) => {
    withViewTransition(() => toggleFullscreen(godName))
  }, [toggleFullscreen])

  // Kill current tab (with confirmation)
  const handleKillTab = useCallback((tabId = activeTabId) => {
    const tab = tabs.find(t => t.id === tabId)
    if (!tab) return

    const tabGods = getGodsForTab(tabId)

    if (tabs.length === 1 && tabGods.length === 0) {
      return // Don't close last empty tab
    }

    setConfirmModal({
      title: `Close "${tab.name}"?`,
      message: tabGods.length > 0
        ? `This will banish ${tabGods.length} god${tabGods.length > 1 ? 's' : ''}.`
        : 'This tab will be closed.',
      confirmText: 'Close',
      danger: true,
      onConfirm: () => {
        // Kill all gods in this tab
        tabGods.forEach(g => send({ event: 'god:kill', godName: g.name }))
        // Tell server to remove tab (server will broadcast state:sync)
        send({ event: 'tab:remove', tabId })
        setConfirmModal(null)
      }
    })
  }, [tabs, activeTabId, send, getGodsForTab])

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

      // Check if this is one of our app shortcuts (Escape only works outside xterm)
      const isAppShortcut = (
        (e.ctrlKey && ['n', 'k', 'f', 'l', 'd', 'r'].includes(key)) ||
        (e.altKey && (['n', 'k', ',', '.', 'w', 'h', 'g', 'b'].includes(key) || (e.key >= '1' && e.key <= '9')))
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

      // Alt+W/H/G/B: Switch views
      if (e.altKey && key === 'w') {
        e.preventDefault()
        e.stopPropagation()
        handleViewChange('work')
        return
      }
      if (e.altKey && key === 'h') {
        e.preventDefault()
        e.stopPropagation()
        handleViewChange('history')
        return
      }
      if (e.altKey && key === 'g') {
        e.preventDefault()
        e.stopPropagation()
        handleViewChange('git')
        return
      }
      if (e.altKey && key === 'b') {
        e.preventDefault()
        e.stopPropagation()
        handleViewChange('browser')
        return
      }

      // Ctrl+K: Kill focused god
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault()
        e.stopPropagation()
        if (focusedGod) {
          handleKillGod(focusedGod)
        } else if (activeGods.length === 1) {
          handleKillGod(activeGods[0].name)
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

      // Escape: Exit fullscreen, then focus mode, then clear focus
      if (e.key === 'Escape') {
        if (fullscreenGod) {
          e.preventDefault()
          e.stopPropagation()
          handleToggleFullscreen()
          return
        } else if (workLayout === 'focus') {
          e.preventDefault()
          e.stopPropagation()
          handleExitFocus()
          return
        } else if (focusedGod) {
          handleSetFocus(null)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [
    handleSpawnTerminal, handleKillGod, handleKillTab, handleToggleFullscreen,
    rotateLayout, focusedGod, fullscreenGod, view, workLayout, activeGods,
    toggleDevPanel, handleExitFocus, handleSetFocus, handleViewChange, send, tabs, activeTabId
  ])

  // Get ALL gods for persistent rendering
  const allGods = getAllGods()

  // Get gods to display in the visible grid (active tab or fullscreen)
  const displayGods = fullscreenGod
    ? activeGods.filter(g => g.name === fullscreenGod)
    : activeGods

  // Get hidden gods (on other tabs) - these stay mounted but invisible
  const hiddenGods = allGods.filter(g => g.tabId !== activeTabId)

  return (
    <div className={`flex flex-col h-screen theme-${theme}`}>
      {/* Animated wallpaper */}
      <div className="wallpaper">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
      </div>

      {/* Tab bar */}
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={(tabId) => send({ event: 'tab:select', tabId })}
        onClose={handleKillTab}
        onNew={() => send({ event: 'tab:add' })}
        connected={connected}
        getGodsForTab={getGodsForTab}
        currentView={view}
        onViewChange={handleViewChange}
      />

      {/* Main content area */}
      <main className="flex-1 min-h-0 overflow-hidden p-4">
        {/* Work View */}
        {view === 'work' && (
          activeGods.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-text-secondary">
              <p className="text-base">No gods summoned</p>
              <p className="text-sm opacity-70">
                Press <kbd className="px-1.5 py-0.5 bg-bg-tertiary border border-border rounded text-xs font-mono">Ctrl+N</kbd> to summon
              </p>
            </div>
          ) : workLayout === 'focus' && activeGods.length > 0 ? (
          /* Focus mode: main god + sidebar */
          (() => {
            // Auto-select first god if focusedGod is not set or not in active tab
            const effectiveFocusedGod = (focusedGod && activeGods.some(g => g.name === focusedGod))
              ? focusedGod
              : activeGods[0].name
            return (
          <div className="flex gap-4 h-full">
            {/* Main focused god - 2:1 ratio with sidebar */}
            <div className="flex-[2] min-w-0 relative overflow-hidden">
              <AnimatePresence mode="popLayout">
                {activeGods.filter(g => g.name === effectiveFocusedGod).map(god => (
                  <motion.div
                    key={god.name}
                    className="absolute inset-0"
                    initial={{ x: '-100%', opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: '50%', opacity: 0 }}
                    transition={{
                      type: 'spring',
                      stiffness: 300,
                      damping: 30,
                      opacity: { duration: 0.15 }
                    }}
                  >
                    <GodCard
                      god={god}
                      isFocused={true}
                      isFullscreen={false}
                      onFocus={() => {}}
                      onDoubleClick={() => {}}
                      onClose={() => handleKillGod(god.name)}
                      onToggleFullscreen={() => handleToggleFullscreen(god.name)}
                      tabs={tabs}
                      activeTabId={activeTabId}
                      onMoveToTab={(godName, tabId) => {
                        send({ event: 'god:move', godName, tabId })
                        send({ event: 'tab:select', tabId })
                      }}
                      onMoveToNewTab={(godName) => {
                        send({ event: 'god:move-to-new-tab', godName })
                      }}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            {/* Sidebar with all gods as task cards */}
            <div className="w-80 flex flex-col overflow-y-auto overflow-x-visible p-4">
              <Reorder.Group
                axis="y"
                values={activeGods}
                onReorder={handleGodReorder}
                className="flex flex-col gap-4"
              >
                {activeGods.map(god => (
                  <GodTaskCard
                    key={god.name}
                    god={god}
                    isActive={god.name === effectiveFocusedGod}
                    onClick={() => handleEnterFocus(god.name)}
                    onClose={() => handleKillGod(god.name)}
                  />
                ))}
              </Reorder.Group>
              {/* Action buttons */}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setSummonModalOpen(true)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-black/40 border border-white/20 text-white/80 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
                  title="Summon god (Ctrl+N)"
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
            )
          })()
        ) : (
          /* Grid mode */
          <div className={`grid ${getGridClass(displayGods.length)} gap-4 h-full auto-rows-fr`}>
            {displayGods.map(god => (
              <GodCard
                key={god.name}
                god={god}
                isFocused={focusedGod === god.name}
                isFullscreen={fullscreenGod === god.name}
                onFocus={() => handleSetFocus(god.name)}
                onDoubleClick={() => handleEnterFocus(god.name)}
                onClose={() => handleKillGod(god.name)}
                onToggleFullscreen={() => handleToggleFullscreen(god.name)}
                tabs={tabs}
                activeTabId={activeTabId}
                onMoveToTab={(godName, tabId) => {
                  send({ event: 'god:move', godName, tabId })
                  send({ event: 'tab:select', tabId })
                }}
                onMoveToNewTab={(godName) => {
                  send({ event: 'god:move-to-new-tab', godName })
                }}
              />
            ))}
          </div>
        ))}

        {/* History View */}
        {view === 'history' && (
          <HistoryView send={send} />
        )}

        {/* Git View */}
        {view === 'git' && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-text-secondary">
            <p className="text-base">Git View</p>
            <p className="text-sm opacity-70">Coming soon...</p>
          </div>
        )}

        {/* Browser View */}
        {view === 'browser' && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-text-secondary">
            <p className="text-base">Browser View</p>
            <p className="text-sm opacity-70">Coming soon...</p>
          </div>
        )}
      </main>

      {/* Hidden gods container - keeps terminals alive when on other tabs */}
      <div className="fixed -left-[9999px] -top-[9999px] w-[800px] h-[600px] overflow-hidden pointer-events-none" aria-hidden="true">
        {hiddenGods.map(god => (
          <div key={god.name} className="w-full h-full">
            <GodCard
              god={god}
              isFocused={false}
              isFullscreen={false}
              isHidden={true}
              onFocus={() => {}}
              onDoubleClick={() => {}}
              onClose={() => handleKillGod(god.name)}
              onToggleFullscreen={() => {}}
              tabs={tabs}
              activeTabId={activeTabId}
              onMoveToTab={() => {}}
              onMoveToNewTab={() => {}}
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

      {/* Summon modal */}
      <SummonModal
        isOpen={summonModalOpen}
        usedGodNames={getAllGodNames()}
        onSummon={handleSummon}
        onCancel={() => setSummonModalOpen(false)}
      />

      {/* Status bar */}
      <StatusBar connected={connected} send={send} />

      {/* Dev panel */}
      <DevPanel />
    </div>
  )
}
