/**
 * Tab management handlers.
 */

import { REALMS } from '../config.js'
import { appState, saveState, broadcastState, normalizeTabOrder } from '../state.js'
import { killGodSession } from '../gods.js'
import { killPty, clearOutputBuffer } from '../pty.js'

function getRandomRealmName() {
  const usedNames = new Set(appState.tabs.map(t => t.name))
  const available = REALMS.filter(r => !usedNames.has(r))

  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)]
  }

  // All realms used, add numeral
  let counter = 2
  while (true) {
    const candidate = `${REALMS[Math.floor(Math.random() * REALMS.length)]} ${counter}`
    if (!usedNames.has(candidate)) return candidate
    counter++
  }
}

// Add a god to the cemetery before banishing
function addToCemetery(entity) {
  if (entity.type !== 'god') return
  if (!entity.sessionId) return

  const { PANTHEON } = require('../config.js')
  const godKey = entity.id.toLowerCase()
  const pantheonGod = PANTHEON[godKey] || { color: '#888', voice: 'emma' }
  const tab = appState.tabs.find(t => t.id === entity.tabId)

  const fallen = {
    id: entity.id,
    name: entity.name || entity.id,
    color: entity.color || pantheonGod.color,
    voice: pantheonGod.voice,
    mission: entity.mission || null,
    title: entity.title || null,
    banishedAt: Date.now(),
    tabName: tab?.name || 'Unknown',
    sessionId: entity.sessionId
  }

  appState.cemetery.unshift(fallen)
}

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
        }

        if (entity.type === 'god' || entity.type === 'terminal') {
          killPty(id)
          killGodSession(id)
          clearOutputBuffer(id)
        }
        delete appState.entities[id]
      }
    })

    appState.tabs = appState.tabs.filter(t => t.id !== tabId)
    if (appState.tabs.length === 0) {
      appState.tabs = [{ id: 1, name: 'Olympus' }]
      appState.tabCounter = 1
      appState.activeTabId = 1
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
}
