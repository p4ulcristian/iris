/**
 * Settings, focus, theme, code/markdown viewer handlers.
 */

import fs from 'fs'
import path from 'path'
import http from 'http'
import { LOGS_DIR, PROJECT_LOGS_DIR, BACKEND_LOG, FRONTEND_LOG, SERVICES } from '../config.js'
import {
  appState, saveState, broadcastState, broadcast,
  applySettingsToEnv, generateEntityId, getNextEntityNumber,
  generateStageId, getNextOrder, findStageByEntity, getActiveStage
} from '../state.js'
import * as layout from '../layout.js'
import { splitIntoTile } from '../../entities/_shared/spawn.js'

export const handlers = {
  'settings:update': (ws, data) => {
    const { key, value } = data
    if (!key) return

    // Initialize settings if needed
    if (!appState.settings) {
      appState.settings = {}
    }

    // Update the setting
    appState.settings[key] = value

    // Apply to environment if it's an API key
    applySettingsToEnv()

    saveState()
    broadcastState()
  },

  'theme:set': (ws, data) => {
    appState.theme = data.theme
    saveState()
    broadcastState()
  },

  'focus:set': (ws, data) => {
    const entityId = data.entityId || data.godName
    appState.focusedEntity = entityId || null

    // Find which stage contains this entity and switch to it
    if (entityId) {
      const tab = appState.tabs.find(t => t.id === appState.activeTabId)
      if (tab) {
        const stage = findStageByEntity(tab, entityId)
        if (stage) {
          tab.activeStageId = stage.id
          const tile = layout.findTileByEntity(stage.layout, entityId)
          if (tile) {
            appState.focusedTile = tile.id
          }
        }
      }
    }

    saveState()
    broadcastState()
  },

  'tile:focus': (ws, data) => {
    handlers['pane:focus'](ws, data)
  },

  'tile:hover': (ws, data) => {
    // Track hovered entity for accurate kill targeting (no persist, no broadcast)
    appState.hoveredEntity = data.entityId || null
  },

  'pane:focus': (ws, data) => {  // Legacy alias
    const tileId = data.tileId || data.paneId
    if (!tileId) return

    const tab = appState.tabs.find(t => t.id === appState.activeTabId)
    if (!tab) return

    const activeStage = getActiveStage(tab)
    if (!activeStage?.layout) return

    const tileResult = layout.findTile(activeStage.layout, tileId)
    if (!tileResult) return

    const tile = tileResult.node
    appState.focusedTile = tileId
    appState.focusedEntity = tile.entityId || tile.focusedEntityId || tile.entityIds?.[0] || null

    saveState()
    broadcastState()
  },

  'focus:next': (ws, data) => {
    handleFocusNavigation('next')
  },

  'focus:prev': (ws, data) => {
    handleFocusNavigation('prev')
  },

  'focus:clear': (ws) => {
    appState.focusedEntity = null
    appState.focusedTile = null
    saveState()
    broadcastState()
  },

  'gods:reorder': (ws, data) => {
    handlers['entities:reorder'](ws, data)
  },

  'entities:reorder': (ws, data) => {
    const { order } = data
    if (!Array.isArray(order)) return

    order.forEach((id, idx) => {
      if (appState.entities[id]) {
        appState.entities[id].order = idx
      }
    })

    saveState()
    broadcastState()
  },

  'stages:reorder': (ws, data) => {
    const { stageOrder } = data
    if (!Array.isArray(stageOrder)) return

    const tab = appState.tabs.find(t => t.id === appState.activeTabId)
    if (!tab?.stages) return

    stageOrder.forEach((stageId, idx) => {
      const stage = tab.stages.find(s => s.id === stageId)
      if (!stage?.layout) return

      // Collect all entity IDs in this stage
      const collectEntityIds = (node) => {
        if (!node) return []
        if (node.type === 'tile') {
          if (node.entityId) return [node.entityId]
          if (node.entityIds?.length) return node.entityIds
          return []
        }
        if (node.type === 'split' && node.children) {
          return node.children.flatMap(child => collectEntityIds(child))
        }
        return []
      }

      const entityIds = collectEntityIds(stage.layout)
      const firstEntityId = entityIds[0]
      if (firstEntityId && appState.entities[firstEntityId]) {
        appState.entities[firstEntityId].order = idx
      }
    })

    saveState()
    broadcastState()
  },

  // Code viewer management
  'code:open': (ws, data) => {
    const { filePath, line, entityId, forceNew, diff, relativeToEntity } = data
    if (!filePath) return

    let codeEntity = entityId ? appState.entities[entityId] : null
    let isNewEntity = false

    if (!codeEntity && !forceNew) {
      codeEntity = Object.values(appState.entities).find(
        e => e.type === 'code' && e.tabId === appState.activeTabId
      )
    }

    if (!codeEntity) {
      const newId = generateEntityId('code')
      const num = getNextEntityNumber('code')

      appState.entities[newId] = {
        id: newId,
        type: 'code',
        name: `Code-${num}`,
        tabId: appState.activeTabId,
        order: getNextOrder(appState.activeTabId),
        spawnedAt: Date.now()
      }
      codeEntity = appState.entities[newId]
      isNewEntity = true

      // Split focused tile to place code viewer
      splitIntoTile(newId, appState.activeTabId, { direction: 'horizontal', relativeToEntity })
    }

    // Store pending file in entity
    codeEntity.pendingFile = filePath
    codeEntity.pendingLine = line || 1
    codeEntity.pendingDiff = diff || false

    appState.focusedEntity = codeEntity.id
    saveState()
    broadcastState()

    // For existing entities, also broadcast event
    if (!isNewEntity) {
      broadcast('code:file:open', {
        entityId: codeEntity.id,
        filePath,
        line: line || 1,
        diff: diff || false
      })
    }
  },

  'code:highlight': (ws, data) => {
    const { filePath, highlights } = data
    if (!filePath || !highlights) return

    if (!appState.codeHighlights) {
      appState.codeHighlights = {}
    }

    const existing = appState.codeHighlights[filePath] || []
    appState.codeHighlights[filePath] = [...existing, ...highlights]

    saveState()
    broadcastState()
  },

  'code:highlight:clear': (ws, data) => {
    const { filePath } = data
    if (!appState.codeHighlights) return

    if (filePath) {
      delete appState.codeHighlights[filePath]
    } else {
      appState.codeHighlights = {}
    }

    saveState()
    broadcastState()
  },

  // Show diff in code viewer
  'code:diff': (ws, data) => {
    const { filePath, original, modified, entityId } = data
    if (!filePath || original === undefined || modified === undefined) return

    // Find a code entity to show the diff in
    let codeEntity = entityId ? appState.entities[entityId] : null
    if (!codeEntity) {
      codeEntity = Object.values(appState.entities).find(
        e => e.type === 'code' && e.tabId === appState.activeTabId
      )
    }

    // Broadcast diff event to frontend
    broadcast('code:diff', {
      entityId: codeEntity?.id,
      filePath,
      original,
      modified
    })
  },

  'code:files:sync': (ws, data) => {
    const { entityId, openFiles, activeFilePath, rootPath, expandedFolders } = data
    if (!entityId || !appState.entities[entityId]) return

    appState.entities[entityId].openFiles = openFiles || []
    appState.entities[entityId].activeFilePath = activeFilePath || null
    appState.entities[entityId].rootPath = rootPath || null
    appState.entities[entityId].expandedFolders = expandedFolders || []

    if (rootPath) {
      const folderName = path.basename(rootPath)
      appState.entities[entityId].name = folderName
      appState.entities[entityId].title = folderName
    }

    if (activeFilePath) {
      appState.entities[entityId].status = activeFilePath
    }

    saveState()
    broadcastState()
  },

  // Markdown viewer management
  'md:open': (ws, data) => {
    const { filePath, entityId, forceNew, relativeToEntity } = data
    if (!filePath) return

    let mdEntity = entityId ? appState.entities[entityId] : null
    let isNewEntity = false

    if (!mdEntity && !forceNew) {
      mdEntity = Object.values(appState.entities).find(
        e => e.type === 'markdown' && e.tabId === appState.activeTabId
      )
    }

    if (!mdEntity) {
      const newId = generateEntityId('markdown')
      const fileName = path.basename(filePath)

      appState.entities[newId] = {
        id: newId,
        type: 'markdown',
        name: fileName,
        tabId: appState.activeTabId,
        order: getNextOrder(appState.activeTabId),
        spawnedAt: Date.now()
      }
      mdEntity = appState.entities[newId]
      isNewEntity = true

      // Split focused tile to place markdown viewer
      splitIntoTile(newId, appState.activeTabId, { direction: 'horizontal', relativeToEntity })
    }

    mdEntity.pendingFile = filePath
    mdEntity.name = path.basename(filePath)

    appState.focusedEntity = mdEntity.id
    saveState()
    broadcastState()

    if (!isNewEntity) {
      broadcast('md:file:open', {
        entityId: mdEntity.id,
        filePath
      })
    }
  },

  // Frontend error reporting
  'error:report': (ws, data) => {
    const { error } = data
    if (!error) return

    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true })
    }

    const logFile = path.join(LOGS_DIR, 'frontend-errors.log')
    const timestamp = new Date().toISOString()
    const logEntry = [
      `[${timestamp}]`,
      `Source: ${error.source || 'unknown'}`,
      `Message: ${error.message || 'No message'}`,
      error.stack ? `Stack: ${error.stack}` : null,
      error.context ? `Context: ${JSON.stringify(error.context)}` : null,
      '---'
    ].filter(Boolean).join('\n') + '\n'

    fs.appendFileSync(logFile, logEntry)
  },

  // Log viewer - get log lines with tail-like pagination
  'logs:read': (ws, data) => {
    const { type = 'backend', lines = 100 } = data
    const logFile = type === 'frontend' ? FRONTEND_LOG : BACKEND_LOG

    try {
      if (!fs.existsSync(logFile)) {
        ws.send(JSON.stringify({ event: 'logs:data', type, lines: [], total: 0 }))
        return
      }

      const content = fs.readFileSync(logFile, 'utf-8')
      const allLines = content.split('\n').filter(l => l.trim())
      const lastLines = allLines.slice(-lines)

      ws.send(JSON.stringify({
        event: 'logs:data',
        type,
        lines: lastLines,
        total: allLines.length
      }))
    } catch (err) {
      ws.send(JSON.stringify({ event: 'logs:data', type, lines: [], error: err.message }))
    }
  },

  // Clear log file
  'logs:clear': (ws, data) => {
    const { type = 'backend' } = data
    const logFile = type === 'frontend' ? FRONTEND_LOG : BACKEND_LOG

    try {
      if (fs.existsSync(logFile)) {
        fs.writeFileSync(logFile, '')
      }
      ws.send(JSON.stringify({ event: 'logs:cleared', type }))
    } catch (err) {
      // Error clearing logs
    }
  },

  // Speak volume control
  'speak:volume': (ws, data) => {
    const { volume } = data
    if (volume === undefined) return

    const port = SERVICES.speak.port
    const postData = JSON.stringify({ volume })

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/volume',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 2000
    }, (res) => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => {
        try {
          const result = JSON.parse(body)
          ws.send(JSON.stringify({ event: 'speak:volume:result', ...result }))
        } catch {}
      })
    })

    req.on('error', () => {
      // Error setting volume
    })
    req.on('timeout', () => req.destroy())
    req.write(postData)
    req.end()
  },
}

// Helper for focus navigation - navigates across ALL tabs as one continuous list
function handleFocusNavigation(direction) {
  // Build global entity list based on stage order (visual order), not entity.order
  const globalEntities = []

  // Helper to collect entity IDs from a layout node
  const collectEntityIds = (node) => {
    if (!node) return []
    if (node.type === 'tile') {
      if (node.entityId) return [node.entityId]
      if (node.entityIds?.length) return node.entityIds
      return []
    }
    if (node.type === 'split' && node.children) {
      return node.children.flatMap(child => collectEntityIds(child))
    }
    return []
  }

  for (const tab of appState.tabs) {
    // Iterate stages in their array order (visual order)
    for (const stage of (tab.stages || [])) {
      const entityIds = collectEntityIds(stage.layout)
      for (const entityId of entityIds) {
        const entity = appState.entities[entityId]
        if (entity) {
          globalEntities.push({ entity, tab, stage })
        }
      }
    }
  }

  if (globalEntities.length === 0) return

  // Find current position
  const currentIdx = globalEntities.findIndex(g => g.entity.id === appState.focusedEntity)

  // Calculate new index (with global wrap)
  let newIdx
  if (direction === 'next') {
    newIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % globalEntities.length
  } else {
    newIdx = currentIdx < 0 ? globalEntities.length - 1 : (currentIdx - 1 + globalEntities.length) % globalEntities.length
  }

  const { entity: newEntity, tab: newTab, stage: newStage } = globalEntities[newIdx]

  // Switch tab if needed
  if (newTab.id !== appState.activeTabId) {
    appState.activeTabId = newTab.id
  }

  // Update focus
  appState.focusedEntity = newEntity.id

  // Update active stage (use the stage we already have from the entity list)
  if (newStage) {
    newTab.activeStageId = newStage.id
    const tile = layout.findTileByEntity(newStage.layout, newEntity.id)
    if (tile) {
      appState.focusedTile = tile.id
    }
  }

  saveState()
  broadcastState()
}
