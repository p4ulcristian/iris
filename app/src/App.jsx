import { useState, useEffect, useCallback } from 'react'
import TabBar from './components/TabBar'
import GodCard from './components/GodCard'
import ConfirmModal from './components/ConfirmModal'
import DevPanel from './components/DevPanel'
import { useWebSocket } from './hooks/useWebSocket'
import { useStore, GOD_COLORS } from './store'

export default function App() {
  const { connected, send, lastMessage } = useWebSocket('ws://localhost:9999')

  // Get state and actions from store
  const tabs = useStore(s => s.tabs)
  const activeTabId = useStore(s => s.activeTabId)
  const gods = useStore(s => s.gods)
  const focusedGod = useStore(s => s.focusedGod)
  const fullscreenGod = useStore(s => s.fullscreenGod)
  const layoutMode = useStore(s => s.layoutMode)
  const initialLoadDone = useStore(s => s.initialLoadDone)

  // Actions
  const createTab = useStore(s => s.createTab)
  const closeTab = useStore(s => s.closeTab)
  const switchTab = useStore(s => s.switchTab)
  const nextTab = useStore(s => s.nextTab)
  const prevTab = useStore(s => s.prevTab)
  const goToTab = useStore(s => s.goToTab)
  const addGod = useStore(s => s.addGod)
  const removeGod = useStore(s => s.removeGod)
  const updateGodStatus = useStore(s => s.updateGodStatus)
  const setFocusedGod = useStore(s => s.setFocusedGod)
  const toggleFullscreen = useStore(s => s.toggleFullscreen)
  const rotateLayout = useStore(s => s.rotateLayout)
  const setConnected = useStore(s => s.setConnected)
  const setInitialLoadDone = useStore(s => s.setInitialLoadDone)
  const toggleDevPanel = useStore(s => s.toggleDevPanel)
  const getActiveGods = useStore(s => s.getActiveGods)
  const getGodsForTab = useStore(s => s.getGodsForTab)
  const getAllGodNames = useStore(s => s.getAllGodNames)

  const [confirmModal, setConfirmModal] = useState(null)

  // Update connection status in store
  useEffect(() => {
    setConnected(connected)
  }, [connected, setConnected])

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return

    const { event, ...data } = lastMessage

    switch (event) {
      case 'connected':
        // Only add gods on first connect, not reconnects
        if (!initialLoadDone && data.gods) {
          data.gods.forEach(god => addGod(god))
          setInitialLoadDone(true)
        }
        break

      case 'god:spawned':
        addGod(data)
        break

      case 'god:status':
        updateGodStatus(data.godName || data.name, data.status)
        break

      case 'god:killed':
      case 'god:exited':
        removeGod(data.godName || data.name)
        break
    }
  }, [lastMessage, addGod, removeGod, updateGodStatus, initialLoadDone, setInitialLoadDone])

  // Get gods for active tab
  const activeGods = getActiveGods()

  // Summon a new god
  const handleSummon = useCallback(() => {
    const names = Object.keys(GOD_COLORS)
    const usedNames = getAllGodNames().map(n => n.toLowerCase())
    const available = names.filter(n => !usedNames.includes(n))
    const name = available[0] || names[Math.floor(Math.random() * names.length)]
    const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1)

    send({
      event: 'god:spawn',
      name: capitalizedName,
      task: ''
    })
  }, [send, getAllGodNames])

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
        closeTab(tabId)
        setConfirmModal(null)
      }
    })
  }, [tabs, activeTabId, closeTab, send, getGodsForTab])

  // Calculate grid classes based on layout mode and god count
  const getGridClass = (count) => {
    if (layoutMode === 'auto') {
      if (count === 1) return 'grid-cols-1'
      if (count === 2) return 'grid-cols-2'
      if (count <= 4) return 'grid-cols-2'
      if (count <= 6) return 'grid-cols-3'
      return 'grid-cols-4'
    }
    const layouts = {
      '1x1': 'grid-cols-1',
      '2x1': 'grid-cols-2',
      '2x2': 'grid-cols-2',
      '3x2': 'grid-cols-3',
      '3x3': 'grid-cols-3'
    }
    return layouts[layoutMode] || 'grid-cols-2'
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if in input field
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      // Ctrl+N: Summon god
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault()
        e.stopPropagation()
        handleSummon()
        return
      }

      // Alt+N: New tab
      if (e.altKey && e.key === 'n') {
        e.preventDefault()
        e.stopPropagation()
        createTab()
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
        toggleFullscreen()
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
        prevTab()
        return
      }
      if (e.altKey && e.key === '.') {
        e.preventDefault()
        e.stopPropagation()
        nextTab()
        return
      }

      // Alt+1-9: Go to tab
      if (e.altKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        e.stopPropagation()
        goToTab(parseInt(e.key))
        return
      }

      // Escape: Exit fullscreen or clear focus
      if (e.key === 'Escape') {
        if (fullscreenGod) {
          e.preventDefault()
          e.stopPropagation()
          toggleFullscreen()
          return
        } else if (focusedGod) {
          setFocusedGod(null)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [
    handleSummon, createTab, handleKillGod, handleKillTab, toggleFullscreen,
    rotateLayout, prevTab, nextTab, goToTab, focusedGod, fullscreenGod,
    activeGods, setFocusedGod, toggleDevPanel
  ])

  // Get gods to display (all or just fullscreen)
  const displayGods = fullscreenGod
    ? activeGods.filter(g => g.name === fullscreenGod)
    : activeGods

  return (
    <div className="flex flex-col h-screen bg-bg-primary">
      {/* Tab bar */}
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={switchTab}
        onClose={handleKillTab}
        onNew={createTab}
        onSummon={handleSummon}
        connected={connected}
        godCount={activeGods.length}
        getGodsForTab={getGodsForTab}
      />

      {/* Grid of gods */}
      <main className="flex-1 overflow-hidden p-4">
        {activeGods.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-text-secondary">
            <p className="text-base">No gods summoned</p>
            <p className="text-sm opacity-70">
              Press <kbd className="px-1.5 py-0.5 bg-bg-tertiary border border-border rounded text-xs font-mono">Ctrl+N</kbd> to summon
            </p>
          </div>
        ) : (
          <div className={`grid ${getGridClass(displayGods.length)} gap-4 h-full`}>
            {displayGods.map(god => (
              <GodCard
                key={god.name}
                god={god}
                isFocused={focusedGod === god.name}
                isFullscreen={fullscreenGod === god.name}
                onFocus={() => setFocusedGod(god.name)}
                onClose={() => handleKillGod(god.name)}
                onToggleFullscreen={() => toggleFullscreen(god.name)}
              />
            ))}
          </div>
        )}
      </main>

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

      {/* Dev panel */}
      <DevPanel />
    </div>
  )
}
