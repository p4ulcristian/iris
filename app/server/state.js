import fs from 'fs'
import path from 'path'
import { STATE_FILE, SOCKET_DIR } from './config.js'
import { GOD_COLORS } from '../src/themes/index.js'
import { listGodSockets } from './gods.js'
import * as layout from './layout.js'

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
  version: 4,
  // Realms (tabs) - each realm has multiple stages
  tabs: [{ id: 1, name: 'Olympus', stages: [], activeStageId: null }],
  activeTabId: 1,
  tabCounter: 1,
  stageCounter: 0,        // For generating unique stage IDs
  entities: {},           // All entities: gods, terminals, browsers, git panels, etc.
  entityCounter: 0,       // For generating unique IDs
  tileCounter: 0,         // For generating unique tile IDs
  splitCounter: 0,        // For generating unique split IDs
  theme: 'divine-void',
  focusedEntity: null,    // ID of focused entity
  focusedTile: null,      // ID of focused tile (for multi-tile layouts)
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

  // Clean up orphaned buffer files (buffers without active sockets)
  try {
    const files = fs.readdirSync(SOCKET_DIR)
    const activeSocketNames = new Set(files.filter(f => f.endsWith('.sock')).map(f => f.replace('.sock', '')))
    files
      .filter(f => f.endsWith('.buf'))
      .forEach(bufFile => {
        const name = bufFile.replace('.buf', '')
        if (!activeSocketNames.has(name)) {
          try {
            fs.unlinkSync(path.join(SOCKET_DIR, bufFile))
          } catch {}
        }
      })
  } catch {}

  // Add new sockets to first tab
  sockets.forEach(sock => {
    if (!appState.entities[sock.name]) {
      // Calculate next order inline (getNextOrder may not be available during load)
      const ordersInTab = Object.values(appState.entities)
        .filter(e => e.tabId === 1)
        .map(e => e.order ?? 0)
      const nextOrder = ordersInTab.length > 0 ? Math.max(...ordersInTab) + 1 : 0

      appState.entities[sock.name] = {
        id: sock.name,
        type: 'god',
        name: sock.name,
        tabId: 1,
        order: nextOrder
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

  // Ensure tile/split counters exist
  if (!appState.tileCounter) {
    // Migrate from old paneCounter if exists
    appState.tileCounter = appState.paneCounter || 0
    delete appState.paneCounter
  }
  if (!appState.splitCounter) {
    appState.splitCounter = 0
  }

  // Ensure focusedTile exists
  if (appState.focusedTile === undefined) {
    // Migrate from old focusedPane if exists
    appState.focusedTile = appState.focusedPane || null
    delete appState.focusedPane
  }

  // Ensure stageCounter exists
  if (!appState.stageCounter) {
    appState.stageCounter = 0
  }

  // Migrate from v3 (tab.layout) to v4 (tab.stages[])
  appState.tabs.forEach(tab => {
    // Initialize stages array if not exists
    if (!tab.stages) {
      tab.stages = []
    }
    if (tab.activeStageId === undefined) {
      tab.activeStageId = null
    }

    // Migrate old layout to stages format
    if (tab.layout !== undefined) {
      if (tab.layout !== null) {
        // Convert single layout to a stage
        appState.stageCounter++
        const stageId = `stage-${appState.stageCounter}`
        tab.stages.push({ id: stageId, layout: tab.layout })
        tab.activeStageId = stageId
      }
      delete tab.layout
    }
  })

  // Migrate pane→tile in layout nodes (terminology refactor)
  // Also migrate entityIds[] → entityId (single entity per tile)
  function migrateLayoutNode(node) {
    if (!node) return node
    if (node.type === 'pane') {
      node.type = 'tile'
    }
    if (node.type === 'tile') {
      // Migrate entityIds[] to entityId (take first, create stages for rest later)
      if (node.entityIds && !node.entityId) {
        node.entityId = node.entityIds[0] || null
        // Keep entityIds for now, will be cleaned after orphan stage creation
      }
    }
    if (node.type === 'split' && node.children) {
      node.children = node.children.map(migrateLayoutNode)
    }
    return node
  }
  appState.tabs.forEach(tab => {
    tab.stages.forEach(stage => {
      if (stage.layout) {
        stage.layout = migrateLayoutNode(stage.layout)
      }
    })
  })

  // Validate layouts: remove references to non-existent entities
  const existingEntityIds = new Set(Object.keys(appState.entities))
  appState.tabs.forEach(tab => {
    tab.stages = tab.stages.filter(stage => {
      if (stage.layout) {
        const layoutEntityIds = layout.getAllEntityIds(stage.layout)
        for (const entityId of layoutEntityIds) {
          if (!existingEntityIds.has(entityId)) {
            stage.layout = layout.removeEntityFromLayout(stage.layout, entityId)
          }
        }
        // Remove stage if layout became null (all entities gone)
        return stage.layout !== null
      }
      return false  // Remove stages with no layout
    })
    // Update activeStageId if it was removed
    if (tab.activeStageId && !tab.stages.find(s => s.id === tab.activeStageId)) {
      tab.activeStageId = tab.stages[0]?.id || null
    }
  })

  // Deduplicate: ensure each entity only appears in ONE stage
  // (Remove duplicate stages for the same entity, keeping the first one)
  appState.tabs.forEach(tab => {
    const seenEntities = new Set()
    tab.stages = tab.stages.filter(stage => {
      if (!stage.layout) return false
      const entityIds = layout.getAllEntityIds(stage.layout)
      // Check if any entity in this stage was already seen
      const isDuplicate = entityIds.some(id => seenEntities.has(id))
      if (isDuplicate) {
        return false  // Remove this duplicate stage
      }
      // Mark all entities in this stage as seen
      entityIds.forEach(id => seenEntities.add(id))
      return true
    })
    // Update activeStageId if it was removed
    if (tab.activeStageId && !tab.stages.find(s => s.id === tab.activeStageId)) {
      tab.activeStageId = tab.stages[0]?.id || null
    }
  })

  // Ensure all entities are in a stage (create individual stages for orphans)
  Object.values(appState.entities).forEach(entity => {
    const tab = appState.tabs.find(t => t.id === entity.tabId)
    if (!tab) return

    // Check if entity is in any stage's tile
    let found = false
    for (const stage of tab.stages) {
      if (stage.layout) {
        const tile = layout.findTileByEntity(stage.layout, entity.id)
        if (tile) {
          found = true
          break
        }
      }
    }

    // If not found, create a new stage for this entity
    if (!found) {
      appState.stageCounter++
      const stageId = `stage-${appState.stageCounter}`
      const newStage = {
        id: stageId,
        layout: layout.createTile(entity.id)
      }
      tab.stages.push(newStage)
      if (!tab.activeStageId) {
        tab.activeStageId = stageId
      }
    }
  })

  // Clean up legacy entityIds/focusedEntityId from layout nodes
  function cleanupLegacyFields(node) {
    if (!node) return node
    if (node.type === 'tile') {
      delete node.entityIds
      delete node.focusedEntityId
    }
    if (node.type === 'split' && node.children) {
      node.children.forEach(cleanupLegacyFields)
    }
    return node
  }
  appState.tabs.forEach(tab => {
    tab.stages.forEach(stage => {
      if (stage.layout) {
        cleanupLegacyFields(stage.layout)
      }
    })
  })

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
      project: entity.project || null,  // for git
      pendingFile: entity.pendingFile || null,  // for code
      pendingLine: entity.pendingLine || null   // for code
    }
  })

  entities.sort((a, b) => a.order - b.order)

  // Extract tiles from ALL stages in each tab (so scrolls show all entities)
  const tiles = {}
  appState.tabs.forEach(tab => {
    const allTiles = []
    if (tab.stages) {
      for (const stage of tab.stages) {
        if (stage.layout) {
          const stageTiles = layout.getAllTiles(stage.layout)
          // Mark which stage each tile belongs to
          stageTiles.forEach(tile => {
            tile.stageId = stage.id
            tile.isActiveStage = stage.id === tab.activeStageId
          })
          allTiles.push(...stageTiles)
        }
      }
    }
    tiles[tab.id] = allTiles
  })

  const godColors = GOD_COLORS
  return {
    tabs: appState.tabs,
    activeTabId: appState.activeTabId,
    tabCounter: appState.tabCounter,
    entities,
    theme: appState.theme,
    godColors,
    focusedEntity: appState.focusedEntity,
    focusedTile: appState.focusedTile,
    tiles,
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
    },
    codeHighlights: appState.codeHighlights || {}
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

// Generate a unique tile ID
export function generateTileId() {
  appState.tileCounter++
  return `tile-${appState.tileCounter}`
}

// Alias for backwards compatibility
export const generatePaneId = generateTileId

// Generate a unique split ID
export function generateSplitId() {
  appState.splitCounter++
  return `split-${appState.splitCounter}`
}

// Generate a unique stage ID
export function generateStageId() {
  appState.stageCounter++
  return `stage-${appState.stageCounter}`
}

// Find the stage containing a given entity ID within a tab
export function findStageByEntity(tab, entityId) {
  if (!tab?.stages) return null
  for (const stage of tab.stages) {
    if (stage.layout) {
      const tile = layout.findTileByEntity(stage.layout, entityId)
      if (tile) return stage
    }
  }
  return null
}

// Get the active stage for a tab
export function getActiveStage(tab) {
  if (!tab?.stages || !tab.activeStageId) return null
  return tab.stages.find(s => s.id === tab.activeStageId) || null
}

// Normalize order values for all entities in a tab (0, 1, 2, ...)
// Call this after any mutation that could leave gaps or duplicates
export function normalizeTabOrder(tabId) {
  const entities = Object.values(appState.entities)
    .filter(e => e.tabId === tabId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  entities.forEach((entity, idx) => {
    appState.entities[entity.id].order = idx
  })
}

// Get the next order value for a new entity in a tab
export function getNextOrder(tabId) {
  const orders = Object.values(appState.entities)
    .filter(e => e.tabId === tabId)
    .map(e => e.order ?? 0)

  return orders.length > 0 ? Math.max(...orders) + 1 : 0
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

// Check if a tab is empty (no stages) and delete it if so
// Returns true if tab was deleted, false otherwise
export function deleteTabIfEmpty(tabId) {
  const tab = appState.tabs.find(t => t.id === tabId)
  if (!tab) return false

  // Check if tab has any stages left
  if (tab.stages && tab.stages.length > 0) {
    return false
  }

  // Don't delete the last tab - keep at least one
  if (appState.tabs.length <= 1) {
    return false
  }

  // Remove the tab
  appState.tabs = appState.tabs.filter(t => t.id !== tabId)

  // If this was the active tab, switch to another
  if (appState.activeTabId === tabId) {
    appState.activeTabId = appState.tabs[0].id
  }

  // Clear focusedEntity if it was in the deleted tab
  if (appState.focusedEntity) {
    const focusedEntity = appState.entities[appState.focusedEntity]
    if (focusedEntity?.tabId === tabId) {
      // Find first entity in the new active tab
      const remaining = Object.entries(appState.entities)
        .filter(([_, e]) => e.tabId === appState.activeTabId)
        .sort((a, b) => (a[1].order || 0) - (b[1].order || 0))
      appState.focusedEntity = remaining.length > 0 ? remaining[0][0] : null
    }
  }

  return true
}

