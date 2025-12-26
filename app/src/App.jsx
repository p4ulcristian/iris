import { useState, useEffect, useCallback } from 'react'
import TabBar from './components/TabBar'
import GodCard from './components/GodCard'
import ConfirmModal from './components/ConfirmModal'
import { useWebSocket } from './hooks/useWebSocket'
import { useWorkspaces } from './hooks/useWorkspaces'

const GOD_COLORS = {
  zeus: '#ffd700',
  apollo: '#ffeb3b',
  artemis: '#009688',
  athena: '#2196f3',
  hermes: '#ff9800',
  hades: '#9c27b0',
  poseidon: '#00bcd4',
  hera: '#e91e63',
  ares: '#f44336',
  hephaestus: '#cd7f32',
  aphrodite: '#ff6b9d',
  dionysus: '#7c4dff',
  demeter: '#4caf50'
}

const GRID_LAYOUTS = ['auto', '1x1', '2x1', '2x2', '3x2', '3x3']

export default function App() {
  const { connected, send, lastMessage } = useWebSocket('ws://localhost:9999')
  const {
    tabs,
    activeTab,
    activeTabId,
    createTab,
    closeTab,
    switchTab,
    nextTab,
    prevTab,
    goToTab,
    gods,
    focusedGod,
    setFocusedGod,
    fullscreenGod,
    addGod,
    removeGod,
    updateGodStatus,
    toggleFullscreen
  } = useWorkspaces()

  const [layoutMode, setLayoutMode] = useState('auto')
  const [confirmModal, setConfirmModal] = useState(null)

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return

    const { event, ...data } = lastMessage

    switch (event) {
      case 'connected':
        if (data.gods) {
          data.gods.forEach(god => addGod(god))
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
  }, [lastMessage, addGod, removeGod, updateGodStatus])

  // Summon a new god
  const handleSummon = useCallback(() => {
    const names = Object.keys(GOD_COLORS)
    const allGods = tabs.flatMap(t => t.gods)
    const usedNames = allGods.map(g => g.name.toLowerCase())
    const available = names.filter(n => !usedNames.includes(n))
    const name = available[0] || names[Math.floor(Math.random() * names.length)]
    const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1)

    send({
      event: 'god:spawn',
      name: capitalizedName,
      task: ''
    })
  }, [tabs, send])

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

    if (tabs.length === 1 && tab.gods.length === 0) {
      return // Don't close last empty tab
    }

    setConfirmModal({
      title: `Close "${tab.name}"?`,
      message: tab.gods.length > 0
        ? `This will banish ${tab.gods.length} god${tab.gods.length > 1 ? 's' : ''}.`
        : 'This tab will be closed.',
      confirmText: 'Close',
      danger: true,
      onConfirm: () => {
        // Kill all gods in this tab
        tab.gods.forEach(g => send({ event: 'god:kill', godName: g.name }))
        closeTab(tabId)
        setConfirmModal(null)
      }
    })
  }, [tabs, activeTabId, closeTab, send])

  // Rotate layout
  const handleRotateLayout = useCallback(() => {
    const idx = GRID_LAYOUTS.indexOf(layoutMode)
    const nextIdx = (idx + 1) % GRID_LAYOUTS.length
    setLayoutMode(GRID_LAYOUTS[nextIdx])
  }, [layoutMode])

  // Calculate grid classes based on layout mode and god count
  const getGridClass = (count) => {
    if (layoutMode === 'auto') {
      if (count === 1) return 'grid-cols-1'
      if (count === 2) return 'grid-cols-2'
      if (count <= 4) return 'grid-cols-2'
      if (count <= 6) return 'grid-cols-3'
      return 'grid-cols-4'
    }
    // Manual layouts
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
        } else if (gods.length === 1) {
          handleKillGod(gods[0].name)
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
        handleRotateLayout()
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

      // TODO: Ctrl+M for menu, Ctrl+T for themes, Ctrl+R for terminal
    }

    // Use capture to intercept before xterm gets the events
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [
    handleSummon, createTab, handleKillGod, handleKillTab, toggleFullscreen,
    handleRotateLayout, prevTab, nextTab, goToTab, focusedGod, fullscreenGod,
    gods, setFocusedGod
  ])

  // Get gods to display (all or just fullscreen)
  const displayGods = fullscreenGod
    ? gods.filter(g => g.name === fullscreenGod)
    : gods

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
        godCount={gods.length}
      />

      {/* Layout indicator */}
      {layoutMode !== 'auto' && (
        <div className="absolute top-12 right-4 z-20 px-2 py-1 bg-bg-tertiary border border-border rounded text-xs text-text-secondary">
          Layout: {layoutMode}
        </div>
      )}

      {/* Grid of gods */}
      <main className="flex-1 overflow-hidden p-4">
        {gods.length === 0 ? (
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
    </div>
  )
}
