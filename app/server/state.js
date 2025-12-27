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
  view: 'work',           // 'work' | 'history' | 'git' | 'browser'
  workLayout: 'focus',    // 'grid' | 'focus' (only applies when view === 'work')
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

  // Migrate viewMode -> workLayout if needed
  if (appState.viewMode && !appState.workLayout) {
    appState.workLayout = appState.viewMode
    delete appState.viewMode
  }

  // Ensure view exists
  if (!appState.view) {
    appState.view = 'work'
  }

  // Validate focusedGod when in focus layout
  if (appState.workLayout === 'focus') {
    const godsInActiveTab = Object.keys(appState.gods)
      .filter(name => appState.gods[name].tabId === appState.activeTabId)

    if (!godsInActiveTab.includes(appState.focusedGod)) {
      appState.focusedGod = godsInActiveTab[0] || null
    }

    if (!appState.focusedGod) {
      appState.workLayout = 'grid'
    }
  }

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
  const gods = listGodSockets().map(sock => {
    const godState = appState.gods[sock.name] || {}
    return {
      ...sock,
      // Override color if stored in state (for terminals with custom colors)
      color: godState.color || sock.color,
      displayName: godState.displayName || null,
      tabId: godState.tabId || 1,
      order: godState.order || 0,
      status: godState.status || null,
      mission: godState.mission || null,
      readyState: godState.readyState || 'working',
      spawnedAt: godState.spawnedAt || null
    }
  })

  gods.sort((a, b) => a.order - b.order)

  const godColors = getThemeGodColors(appState.theme)
  return {
    tabs: appState.tabs,
    activeTabId: appState.activeTabId,
    tabCounter: appState.tabCounter,
    gods,
    theme: appState.theme,
    godColors,
    view: appState.view,
    workLayout: appState.workLayout,
    focusedGod: appState.focusedGod
  }
}

export function broadcastState() {
  broadcast('state:sync', getStateForBroadcast())
}

