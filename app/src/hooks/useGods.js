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
    const nameLower = god.name.toLowerCase()
    const color = GOD_COLORS[nameLower] || god.color || '#888'

    setGods(prev => {
      // Don't add if already exists (by name)
      if (prev.find(g => g.name.toLowerCase() === nameLower)) {
        return prev
      }
      return [...prev, { ...god, color, status: god.status || 'laboring' }]
    })

    // Auto-focus new god
    setActiveGod(god.name)
  }, [])

  const removeGod = useCallback((godName) => {
    setGods(prev => prev.filter(g => g.name !== godName))

    // If removing active god, switch to another
    setActiveGod(current => {
      if (current !== godName) return current
      return gods.find(g => g.name !== godName)?.name || null
    })
  }, [gods])

  const updateGodStatus = useCallback((godName, status) => {
    setGods(prev => prev.map(g =>
      g.name === godName ? { ...g, status } : g
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
