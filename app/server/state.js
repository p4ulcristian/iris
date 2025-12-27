import fs from 'fs'
import { STATE_FILE } from './config.js'
import { GOD_COLORS } from '../src/themes/generated/palettes.js'
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
  version: 2,
  tabs: [{ id: 1, name: 'Olympus' }],
  activeTabId: 1,
  tabCounter: 1,
  entities: {},           // All entities: gods, terminals, browsers, git panels, etc.
  entityCounter: 0,       // For generating unique IDs
  theme: 'divine-void',
  focusedEntity: null,    // ID of focused entity
  gitProjects: [],        // [{path, name}]
  cemetery: [],           // Fallen gods: [{id, name, color, voice, mission, title, banishedAt, tabName, sessionId}]
  settings: {             // App settings (API keys, etc.)
    linearApiKey: '',
    userName: '',
    startPrompt: ''
  }
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

  // Migrate from old 'gods' format to 'entities'
  // Also handles case where both exist (merge gods data into entities)
  if (appState.gods) {
    if (!appState.entities) {
      appState.entities = {}
    }
    Object.entries(appState.gods).forEach(([name, godData]) => {
      // Merge god data into entity, preferring gods data for tabId/order/mission etc.
      appState.entities[name] = {
        ...appState.entities[name],  // Keep any existing entity data
        ...godData,                   // Override with gods data
        id: name,
        type: godData.displayName ? 'terminal' : 'god',
        name: godData.displayName || name
      }
    })
    delete appState.gods
  }

  // Migrate focusedGod to focusedEntity
  if (appState.focusedGod !== undefined) {
    appState.focusedEntity = appState.focusedGod
    delete appState.focusedGod
  }

  // Remove old view/workLayout if present
  delete appState.view
  delete appState.workLayout

  // Ensure entities object exists
  if (!appState.entities) {
    appState.entities = {}
  }

  // Ensure entityCounter exists
  if (!appState.entityCounter) {
    appState.entityCounter = 0
  }

  // Merge with discovered sockets (gods/terminals with active dtach sessions)
  const sockets = listGodSockets()
  const socketNames = new Set(sockets.map(s => s.name))

  // Remove terminal-type entities without sockets
  Object.keys(appState.entities).forEach(id => {
    const entity = appState.entities[id]
    if ((entity.type === 'god' || entity.type === 'terminal') && !socketNames.has(id)) {
      delete appState.entities[id]
    }
  })

  // Add new sockets to first tab
  sockets.forEach(sock => {
    if (!appState.entities[sock.name]) {
      const entitiesInTab = Object.values(appState.entities).filter(e => e.tabId === 1)
      appState.entities[sock.name] = {
        id: sock.name,
        type: 'god',
        name: sock.name,
        tabId: 1,
        order: entitiesInTab.length
      }
    }
  })

  // Validate focusedEntity - ensure it's in active tab
  const entitiesInActiveTab = Object.keys(appState.entities)
    .filter(id => appState.entities[id].tabId === appState.activeTabId)

  if (!entitiesInActiveTab.includes(appState.focusedEntity)) {
    appState.focusedEntity = entitiesInActiveTab[0] || null
  }

  // Ensure settings object exists
  if (!appState.settings) {
    appState.settings = { linearApiKey: '' }
  }

  // Ensure cemetery array exists
  if (!appState.cemetery) {
    appState.cemetery = []
  }

  // Apply settings to environment
  applySettingsToEnv()

  saveState()
}

// Apply settings to process.env for runtime use
export function applySettingsToEnv() {
  if (appState.settings?.linearApiKey) {
    process.env.LINEAR_API_KEY = appState.settings.linearApiKey
  }
  if (appState.settings?.googleClientId) {
    process.env.GOOGLE_CLIENT_ID = appState.settings.googleClientId
  }
  if (appState.settings?.googleClientSecret) {
    process.env.GOOGLE_CLIENT_SECRET = appState.settings.googleClientSecret
  }
}

// Mask sensitive values for client
function maskApiKey(key) {
  if (!key || key.length < 8) return key ? '••••' : ''
  return '••••••••' + key.slice(-4)
}

export function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(appState, null, 2))
  } catch (e) {
    console.error('Failed to save state:', e)
  }
}

export function getStateForBroadcast() {
  // Get socket info for gods/terminals
  const sockets = listGodSockets()
  const socketMap = Object.fromEntries(sockets.map(s => [s.name, s]))

  // Build entities array from appState.entities
  const entities = Object.values(appState.entities).map(entity => {
    const sock = socketMap[entity.id]

    // For god/terminal types, merge with socket info
    if (entity.type === 'god' || entity.type === 'terminal') {
      return {
        id: entity.id,
        type: entity.type,
        name: entity.name || entity.id,
        color: entity.color || sock?.color,
        voice: sock?.voice,
        tabId: entity.tabId || 1,
        order: entity.order || 0,
        title: entity.title || null,
        status: entity.status || null,
        mission: entity.mission || null,
        readyState: entity.readyState || 'working',
        spawnedAt: entity.spawnedAt || null
      }
    }

    // For view entities (browser, git, etc.)
    return {
      id: entity.id,
      type: entity.type,
      name: entity.name,
      tabId: entity.tabId || 1,
      order: entity.order || 0,
      spawnedAt: entity.spawnedAt || null,
      // View-specific data
      url: entity.url || null,        // for browser
      project: entity.project || null  // for git
    }
  })

  entities.sort((a, b) => a.order - b.order)

  const godColors = GOD_COLORS
  return {
    tabs: appState.tabs,
    activeTabId: appState.activeTabId,
    tabCounter: appState.tabCounter,
    entities,
    theme: appState.theme,
    godColors,
    focusedEntity: appState.focusedEntity,
    gitProjects: appState.gitProjects || [],
    cemetery: appState.cemetery || [],
    settings: {
      linearApiKey: maskApiKey(appState.settings?.linearApiKey),
      hasLinearApiKey: !!appState.settings?.linearApiKey,
      userName: appState.settings?.userName || '',
      startPrompt: appState.settings?.startPrompt || '',
      googleClientId: maskApiKey(appState.settings?.googleClientId),
      hasGoogleClientId: !!appState.settings?.googleClientId,
      googleClientSecret: maskApiKey(appState.settings?.googleClientSecret),
      hasGoogleClientSecret: !!appState.settings?.googleClientSecret,
      googleCalendar: {
        connected: !!appState.settings?.googleCalendar?.refresh_token,
        email: appState.settings?.googleCalendar?.email || null
      }
    }
  }
}

export function broadcastState() {
  broadcast('state:sync', getStateForBroadcast())
}

// Generate a unique entity ID
export function generateEntityId(type) {
  appState.entityCounter++
  return `${type}-${appState.entityCounter}`
}

// Get next number for auto-naming entities of a type
export function getNextEntityNumber(type) {
  const existing = Object.values(appState.entities)
    .filter(e => e.type === type)
    .map(e => {
      const match = e.name?.match(new RegExp(`^${type}-(\\d+)$`, 'i'))
      return match ? parseInt(match[1]) : 0
    })
  return existing.length > 0 ? Math.max(...existing) + 1 : 1
}

