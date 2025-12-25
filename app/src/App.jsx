import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence } from 'motion/react'
import GodTabs from './components/GodTabs'
import GodCard from './components/GodCard'
import StatusBar from './components/StatusBar'
import { useWebSocket } from './hooks/useWebSocket'
import { useGods } from './hooks/useGods'

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

export default function App() {
  const { connected, send, lastMessage } = useWebSocket('ws://localhost:9999')
  const { gods, activeGod, setActiveGod, addGod, removeGod, updateGodStatus } = useGods()
  const [voiceState, setVoiceState] = useState('ready')

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return

    const { event, ...data } = lastMessage

    switch (event) {
      case 'connected':
        // Initial state from server
        if (data.gods) {
          data.gods.forEach(god => addGod(god))
        }
        break

      case 'god:spawned':
        addGod(data)
        break

      case 'god:status':
        updateGodStatus(data.sessionName, data.status)
        break

      case 'god:killed':
      case 'god:exited':
        removeGod(data.sessionName)
        break

      case 'voice:listening':
        setVoiceState('listening')
        break

      case 'voice:processing':
        setVoiceState('processing')
        break

      case 'voice:ready':
        setVoiceState('ready')
        break
    }
  }, [lastMessage, addGod, removeGod, updateGodStatus])

  // Summon a new god
  const handleSummon = useCallback(() => {
    const names = Object.keys(GOD_COLORS)
    const usedNames = gods.map(g => g.name.toLowerCase())
    const available = names.filter(n => !usedNames.includes(n))
    const name = available[0] || names[Math.floor(Math.random() * names.length)]
    const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1)

    send({
      event: 'god:spawn',
      name: capitalizedName,
      task: '' // Empty task for now, will open interactive claude
    })
  }, [gods, send])

  // Banish a god
  const handleBanish = useCallback((sessionName) => {
    send({
      event: 'god:kill',
      sessionName
    })
  }, [send])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+N: Summon
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault()
        handleSummon()
      }

      // Ctrl+W: Banish active
      if (e.ctrlKey && e.key === 'w' && activeGod) {
        e.preventDefault()
        handleBanish(activeGod)
      }

      // Ctrl+Tab: Next god
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        if (gods.length > 1) {
          const idx = gods.findIndex(g => g.sessionName === activeGod)
          const nextIdx = (idx + 1) % gods.length
          setActiveGod(gods[nextIdx].sessionName)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [gods, activeGod, handleSummon, handleBanish, setActiveGod])

  const activeGodData = gods.find(g => g.sessionName === activeGod)

  return (
    <div className="flex flex-col h-screen bg-bg-primary">

      {/* Tab bar */}
      <GodTabs
        gods={gods}
        activeGod={activeGod}
        onSelect={setActiveGod}
        onClose={handleBanish}
        onSummon={handleSummon}
        connected={connected}
      />

      {/* Main content */}
      <main className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          {activeGodData ? (
            <GodCard
              key={activeGodData.sessionName}
              god={activeGodData}
              onClose={() => handleBanish(activeGodData.sessionName)}
            />
          ) : (
            <div key="empty" className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-text-secondary">
              <p className="text-base">No gods summoned</p>
              <p className="text-sm opacity-70">
                Press <kbd className="px-1.5 py-0.5 bg-bg-tertiary border border-border rounded text-xs font-mono">Ctrl+N</kbd> or click Summon
              </p>
            </div>
          )}
        </AnimatePresence>
      </main>

      {/* Status bar */}
      <StatusBar
        voiceState={voiceState}
        godCount={gods.length}
        connected={connected}
      />
    </div>
  )
}
