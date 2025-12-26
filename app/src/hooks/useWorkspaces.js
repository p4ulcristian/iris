import { useState, useCallback, useMemo } from 'react'

let tabCounter = 1

export function useWorkspaces() {
  const [tabs, setTabs] = useState([{ id: 1, name: 'Main', gods: [] }])
  const [activeTabId, setActiveTabId] = useState(1)
  const [focusedGod, setFocusedGod] = useState(null)
  const [fullscreenGod, setFullscreenGod] = useState(null)

  // Get active tab
  const activeTab = useMemo(() => {
    const found = tabs.find(t => t.id === activeTabId)
    return found || tabs[0]
  }, [tabs, activeTabId])

  // Get gods for active tab
  const gods = useMemo(() => {
    return activeTab?.gods || []
  }, [activeTab])

  // Create new tab
  const createTab = useCallback((name) => {
    tabCounter++
    const newId = tabCounter
    // If name is not a string (e.g., event object from onClick), use default
    const tabName = (typeof name === 'string' && name) ? name : `Tab ${newId}`
    setTabs(prev => [...prev, { id: newId, name: tabName, gods: [] }])
    setActiveTabId(newId)
  }, [])

  // Close tab
  const closeTab = useCallback((tabId) => {
    setTabs(prev => {
      const remaining = prev.filter(t => t.id !== tabId)
      if (remaining.length === 0) {
        // Reset to a fresh Main tab
        setActiveTabId(1)
        tabCounter = 1
        return [{ id: 1, name: 'Main', gods: [] }]
      }
      // If we closed the active tab, switch to the first remaining one
      if (tabId === activeTabId) {
        setActiveTabId(remaining[0].id)
      }
      return remaining
    })
  }, [activeTabId])

  // Rename tab
  const renameTab = useCallback((tabId, name) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, name } : t))
  }, [])

  // Switch to tab
  const switchTab = useCallback((tabId) => {
    setActiveTabId(tabId)
    setFocusedGod(null)
    setFullscreenGod(null)
  }, [])

  // Next tab
  const nextTab = useCallback(() => {
    const idx = tabs.findIndex(t => t.id === activeTabId)
    const nextIdx = (idx + 1) % tabs.length
    setActiveTabId(tabs[nextIdx].id)
  }, [tabs, activeTabId])

  // Previous tab
  const prevTab = useCallback(() => {
    const idx = tabs.findIndex(t => t.id === activeTabId)
    const prevIdx = (idx - 1 + tabs.length) % tabs.length
    setActiveTabId(tabs[prevIdx].id)
  }, [tabs, activeTabId])

  // Go to tab by number
  const goToTab = useCallback((num) => {
    if (num >= 1 && num <= tabs.length) {
      setActiveTabId(tabs[num - 1].id)
    }
  }, [tabs])

  // Add god to active tab
  const addGod = useCallback((god) => {
    setTabs(prev => prev.map(t => {
      if (t.id === activeTabId) {
        if (t.gods.some(g => g.name === god.name)) return t
        return { ...t, gods: [...t.gods, god] }
      }
      return t
    }))
    setFocusedGod(god.name)
  }, [activeTabId])

  // Remove god from all tabs
  const removeGod = useCallback((godName) => {
    setTabs(prev => prev.map(t => ({
      ...t,
      gods: t.gods.filter(g => g.name !== godName)
    })))
    if (focusedGod === godName) setFocusedGod(null)
    if (fullscreenGod === godName) setFullscreenGod(null)
  }, [focusedGod, fullscreenGod])

  // Update god status
  const updateGodStatus = useCallback((godName, status) => {
    setTabs(prev => prev.map(t => ({
      ...t,
      gods: t.gods.map(g => g.name === godName ? { ...g, status } : g)
    })))
  }, [])

  // Toggle fullscreen
  const toggleFullscreen = useCallback((godName = null) => {
    const target = godName || focusedGod
    if (!target) return
    setFullscreenGod(prev => prev === target ? null : target)
  }, [focusedGod])

  return {
    tabs,
    activeTab,
    activeTabId,
    createTab,
    closeTab,
    renameTab,
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
  }
}
