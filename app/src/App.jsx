import { useState, useEffect, useCallback } from 'react'
import TabBar from './components/TabBar'
import GodCard from './components/GodCard'
import StatusBar from './components/StatusBar'
import ConfirmModal from './components/ConfirmModal'
import SummonModal from './components/SummonModal'
import DevPanel from './components/DevPanel'
import { useWebSocket } from './hooks/useWebSocket'
import { useStore } from './store'
import { withViewTransition } from './hooks/useViewTransition'

export default function App() {
  const { connected, send, lastMessage } = useWebSocket('ws://localhost:9999')

  // Get state and actions from store
  const tabs = useStore(s => s.tabs)
  const activeTabId = useStore(s => s.activeTabId)
  const gods = useStore(s => s.gods)
  const focusedGod = useStore(s => s.focusedGod)
  const fullscreenGod = useStore(s => s.fullscreenGod)
  const layoutMode = useStore(s => s.layoutMode)
  const viewMode = useStore(s => s.viewMode)
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
        // Check if viewMode or focusedGod is changing - trigger view transition
        const viewModeChanging = data.viewMode !== viewMode || data.focusedGod !== focusedGod

        const doSync = () => {
          syncState(data)
          if (data.services) {
            setServices(data.services)
          }
          setInitialLoadDone(true)
        }

        if (viewModeChanging && initialLoadDone) {
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
  }, [lastMessage, syncState, updateGodStatus, setInitialLoadDone, setServices, viewMode, focusedGod, initialLoadDone])

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
    if (activeGods.length < 2) return  // No point in focus mode with 1 god
    send({ event: 'viewMode:set', mode: 'focus', focusedGod: godName })
  }, [activeGods.length, send])

  // Exit focus mode
  const handleExitFocus = useCallback(() => {
    send({ event: 'viewMode:set', mode: 'grid' })
  }, [send])

  // Set focused god (server event)
  const handleSetFocus = useCallback((godName) => {
    send({ event: 'focus:set', godName })
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
        } else if (viewMode === 'focus') {
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
    rotateLayout, focusedGod, fullscreenGod, viewMode, activeGods,
    toggleDevPanel, handleExitFocus, handleSetFocus, send, tabs, activeTabId
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
    <div className={`flex flex-col h-screen bg-bg-primary theme-${theme}`}>
      {/* Tab bar */}
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={(tabId) => send({ event: 'tab:select', tabId })}
        onClose={handleKillTab}
        onNew={() => send({ event: 'tab:add' })}
        onSummon={() => setSummonModalOpen(true)}
        connected={connected}
        godCount={activeGods.length}
        getGodsForTab={getGodsForTab}
      />

      {/* Gods area */}
      <main className="flex-1 min-h-0 overflow-hidden p-4">
        {activeGods.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-text-secondary">
            <p className="text-base">No gods summoned</p>
            <p className="text-sm opacity-70">
              Press <kbd className="px-1.5 py-0.5 bg-bg-tertiary border border-border rounded text-xs font-mono">Ctrl+N</kbd> to summon
            </p>
          </div>
        ) : viewMode === 'focus' && focusedGod && activeGods.length > 1 ? (
          /* Focus mode: main god + sidebar */
          <div className="flex gap-4 h-full">
            {/* Main focused god - 2:1 ratio with sidebar */}
            <div className="flex-[2] min-w-0">
              {activeGods.filter(g => g.name === focusedGod).map(god => (
                <GodCard
                  key={god.name}
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
              ))}
            </div>
            {/* Sidebar with other gods */}
            <div className="flex-1 min-w-[240px] max-w-[360px] flex flex-col gap-2 overflow-y-auto">
              {activeGods.filter(g => g.name !== focusedGod).map(god => (
                <div
                  key={god.name}
                  className="h-32 flex-shrink-0"
                >
                  <GodCard
                    god={god}
                    isFocused={false}
                    isFullscreen={false}
                    onFocus={() => handleEnterFocus(god.name)}
                    onDoubleClick={() => {}}
                    onClose={() => handleKillGod(god.name)}
                    onToggleFullscreen={() => handleToggleFullscreen(god.name)}
                    tabs={tabs}
                    activeTabId={activeTabId}
                    compact={true}
                    onMoveToTab={(godName, tabId) => {
                      send({ event: 'god:move', godName, tabId })
                      send({ event: 'tab:select', tabId })
                    }}
                    onMoveToNewTab={(godName) => {
                      send({ event: 'god:move-to-new-tab', godName })
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
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
