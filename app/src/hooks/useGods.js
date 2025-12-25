import { useState, useCallback } from 'react'

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

export function useGods() {
  const [gods, setGods] = useState([])
  const [activeGod, setActiveGod] = useState(null)

  const addGod = useCallback((god) => {
    const name = god.name.toLowerCase()
    const color = GOD_COLORS[name] || '#888'

    setGods(prev => {
      // Don't add if already exists
      if (prev.find(g => g.sessionName === god.sessionName)) {
        return prev
      }
      return [...prev, { ...god, color, status: 'laboring' }]
    })

    // Auto-focus new god
    setActiveGod(god.sessionName)
  }, [])

  const removeGod = useCallback((sessionName) => {
    setGods(prev => prev.filter(g => g.sessionName !== sessionName))

    // If removing active god, switch to another
    setActiveGod(current => {
      if (current !== sessionName) return current
      return gods.find(g => g.sessionName !== sessionName)?.sessionName || null
    })
  }, [gods])

  const updateGodStatus = useCallback((sessionName, status) => {
    setGods(prev => prev.map(g =>
      g.sessionName === sessionName ? { ...g, status } : g
    ))
  }, [])

  return {
    gods,
    activeGod,
    setActiveGod,
    addGod,
    removeGod,
    updateGodStatus
  }
}
