import { useState, useEffect, useCallback } from 'react'
import GodCard from './components/GodCard'
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
        // Initial state from server - discover existing gods
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
  const handleBanish = useCallback((godName) => {
    send({
      event: 'god:kill',
      godName
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
          const idx = gods.findIndex(g => g.name === activeGod)
          const nextIdx = (idx + 1) % gods.length
          setActiveGod(gods[nextIdx].name)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [gods, activeGod, handleSummon, handleBanish, setActiveGod])

  // Calculate grid layout based on god count
  const getGridClass = (count) => {
    if (count === 1) return 'grid-cols-1'
    if (count === 2) return 'grid-cols-2'
    if (count <= 4) return 'grid-cols-2'
    if (count <= 6) return 'grid-cols-3'
    return 'grid-cols-4'
  }

  return (
    <div className="flex flex-col h-screen bg-bg-primary">

      {/* Toolbar */}
      <nav className="flex items-center gap-2 h-10 px-3 bg-bg-secondary border-b border-border">
        <button
          onClick={handleSummon}
          disabled={!connected}
          className={`
            h-7 px-3 rounded text-sm font-medium transition-all
            ${connected
              ? 'bg-accent text-white hover:bg-[#5a62e0]'
              : 'bg-bg-tertiary text-text-secondary cursor-not-allowed'
            }
          `}
        >
          + Summon
        </button>
        <span className="text-text-secondary text-sm">
          {gods.length} god{gods.length !== 1 ? 's' : ''}
        </span>
        <div className="flex-1" />
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
      </nav>

      {/* Grid of gods */}
      <main className="flex-1 overflow-hidden p-4">
        {gods.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-text-secondary">
            <p className="text-base">No gods summoned</p>
            <p className="text-sm opacity-70">
              Press <kbd className="px-1.5 py-0.5 bg-bg-tertiary border border-border rounded text-xs font-mono">Ctrl+N</kbd> or click Summon
            </p>
          </div>
        ) : (
          <div className={`grid ${getGridClass(gods.length)} gap-4 h-full`}>
            {gods.map(god => (
              <GodCard
                key={god.name}
                god={god}
                onClose={() => handleBanish(god.name)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
