import fs from 'fs'
import { STATE_FILE } from './config.js'
import { getThemeGodColors } from '../src/themes/generated/themes.js'
import { listGodSockets } from './gods.js'

// Broadcast function - set by index.js
let broadcastFn = null

export function setBroadcast(fn) {
  broadcastFn = fn
}

export function broadcast(event, data = {}) {
  if (broadcastFn) broadcastFn(event, data)
}

// App state (source of truth)
export const appState = {
  version: 1,
  tabs: [{ id: 1, name: 'Olympus' }],
  activeTabId: 1,
  tabCounter: 1,
  gods: {},
  theme: 'divine-void',
  viewMode: 'grid',
  focusedGod: null
}

export function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))
      Object.assign(appState, data)
    }
  } catch (e) {
    console.error('Failed to load state:', e)
  }

  // Merge with discovered sockets
  const sockets = listGodSockets()
  const socketNames = new Set(sockets.map(s => s.name))

  // Remove gods without sockets
  Object.keys(appState.gods).forEach(name => {
    if (!socketNames.has(name)) delete appState.gods[name]
  })

  // Add new sockets to Main tab
  sockets.forEach(sock => {
    if (!appState.gods[sock.name]) {
      const godsInMain = Object.values(appState.gods).filter(g => g.tabId === 1)
      appState.gods[sock.name] = { tabId: 1, order: godsInMain.length }
    }
  })

  saveState()
}

export function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(appState, null, 2))
  } catch (e) {
    console.error('Failed to save state:', e)
  }
}

export function getStateForBroadcast() {
  const gods = listGodSockets().map(sock => ({
    ...sock,
    tabId: appState.gods[sock.name]?.tabId || 1,
    order: appState.gods[sock.name]?.order || 0,
    status: appState.gods[sock.name]?.status || null
  }))

  gods.sort((a, b) => a.order - b.order)

  const godColors = getThemeGodColors(appState.theme)
  return {
    tabs: appState.tabs,
    activeTabId: appState.activeTabId,
    tabCounter: appState.tabCounter,
    gods,
    theme: appState.theme,
    godColors,
    viewMode: appState.viewMode,
    focusedGod: appState.focusedGod
  }
}

export function broadcastState() {
  broadcast('state:sync', getStateForBroadcast())
}

