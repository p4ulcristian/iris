/**
 * Tab management handlers.
 */

import { appState, saveState, broadcastState, normalizeTabOrder } from '../state.js'
import { killGod } from '../gods.js'
import { addToCemetery, getRandomRealmName } from '../../entities/_shared/index.js'

export const handlers = {
  'tab:add': (ws, data) => {
    appState.tabCounter++
    const newTab = {
      id: appState.tabCounter,
      name: data.name || getRandomRealmName(),
      stages: [],
      activeStageId: null
    }
    appState.tabs.push(newTab)
    appState.activeTabId = newTab.id
    saveState()
    broadcastState()
  },

  'tab:remove': (ws, data) => {
    const tabId = data.tabId

    // Remove all entities in this tab (and clean up PTYs for god/terminal types)
    Object.keys(appState.entities).forEach(id => {
      const entity = appState.entities[id]
      if (entity.tabId === tabId) {
        // Add gods to cemetery before banishing
        if (entity.type === 'god') {
          addToCemetery(entity)
          killGod(id)
        }
        delete appState.entities[id]
      }
    })

    appState.tabs = appState.tabs.filter(t => t.id !== tabId)
    if (appState.tabs.length === 0) {
      // Create a fresh tab with proper counter (don't hardcode ID 1)
      appState.tabCounter++
      appState.tabs = [{ id: appState.tabCounter, name: 'Olympus', stages: [], activeStageId: null }]
      appState.activeTabId = appState.tabCounter
    } else if (appState.activeTabId === tabId) {
      appState.activeTabId = appState.tabs[0].id
    }

    // Reset focusedEntity if it was in removed tab
    if (appState.focusedEntity && !appState.entities[appState.focusedEntity]) {
      const remaining = Object.entries(appState.entities)
        .filter(([_, e]) => e.tabId === appState.activeTabId)
        .sort((a, b) => a[1].order - b[1].order)
      appState.focusedEntity = remaining.length > 0 ? remaining[0][0] : null
    }

    saveState()
    broadcastState()
  },

  'tab:select': (ws, data) => {
    appState.activeTabId = data.tabId

    // Ensure focusedEntity is in new tab
    const entitiesInTab = Object.keys(appState.entities)
      .filter(id => appState.entities[id].tabId === data.tabId)
      .sort((a, b) => appState.entities[a].order - appState.entities[b].order)

    if (!entitiesInTab.includes(appState.focusedEntity)) {
      appState.focusedEntity = entitiesInTab[0] || null
    }

    saveState()
    broadcastState()
  },

  'tab:rename': (ws, data) => {
    const tab = appState.tabs.find(t => t.id === data.tabId)
    if (tab) tab.name = data.name
    saveState()
    broadcastState()
  },

  'tab:prev': (ws) => {
    const tabs = appState.tabs
    if (tabs.length === 0) return
    const idx = tabs.findIndex(t => t.id === appState.activeTabId)
    const prevIdx = (idx - 1 + tabs.length) % tabs.length
    handlers['tab:select'](ws, { tabId: tabs[prevIdx].id })
  },

  'tab:next': (ws) => {
    const tabs = appState.tabs
    if (tabs.length === 0) return
    const idx = tabs.findIndex(t => t.id === appState.activeTabId)
    const nextIdx = (idx + 1) % tabs.length
    handlers['tab:select'](ws, { tabId: tabs[nextIdx].id })
  },

  'tab:goto': (ws, data) => {
    const { index } = data
    const tabs = appState.tabs
    if (index >= 0 && index < tabs.length) {
      handlers['tab:select'](ws, { tabId: tabs[index].id })
    }
  },
}
