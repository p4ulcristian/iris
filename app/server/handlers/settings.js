/**
 * Settings, focus, theme, code/markdown viewer handlers.
 */

import fs from 'fs'
import path from 'path'
import { LOGS_DIR } from '../config.js'
import {
  appState, saveState, broadcastState, broadcast,
  applySettingsToEnv, generateEntityId, getNextEntityNumber,
  generateStageId, getNextOrder, findStageByEntity, getActiveStage
} from '../state.js'
import * as layout from '../layout.js'

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
    const { filePath, line, entityId, forceNew } = data
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

      const tab = appState.tabs.find(t => t.id === appState.activeTabId)
      if (tab) {
        const stageId = generateStageId()
        const tileNode = layout.createTile([newId], newId)
        const newStage = { id: stageId, layout: tileNode }
        tab.stages.push(newStage)
        tab.activeStageId = stageId
        appState.focusedTile = tileNode.id
      }
    }

    // Store pending file in entity
    codeEntity.pendingFile = filePath
    codeEntity.pendingLine = line || 1

    appState.focusedEntity = codeEntity.id
    saveState()
    broadcastState()

    // For existing entities, also broadcast event
    if (!isNewEntity) {
      broadcast('code:file:open', {
        entityId: codeEntity.id,
        filePath,
        line: line || 1
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

  'code:files:sync': (ws, data) => {
    const { entityId, openFiles, activeFilePath, rootPath } = data
    const logLine = `[${new Date().toISOString()}] [code:files:sync] entityId=${entityId} rootPath=${rootPath} activeFilePath=${activeFilePath}\n`
    fs.appendFileSync(path.join(LOGS_DIR, 'code-sync.log'), logLine)

    if (!entityId || !appState.entities[entityId]) return

    appState.entities[entityId].openFiles = openFiles || []
    appState.entities[entityId].activeFilePath = activeFilePath || null

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
    const { filePath, entityId, forceNew } = data
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

      const tab = appState.tabs.find(t => t.id === appState.activeTabId)
      if (tab) {
        const stageId = generateStageId()
        const tileNode = layout.createTile([newId], newId)
        const newStage = { id: stageId, layout: tileNode }
        tab.stages.push(newStage)
        tab.activeStageId = stageId
        appState.focusedTile = tileNode.id
      }
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
    console.error('[Frontend Error]', error.message, error.source ? `(${error.source})` : '')
  },
}

// Helper for focus navigation
function handleFocusNavigation(direction) {
  const tab = appState.tabs.find(t => t.id === appState.activeTabId)
  if (!tab || !tab.stages.length) return

  const entitiesInTab = Object.values(appState.entities)
    .filter(e => e.tabId === appState.activeTabId)
    .sort((a, b) => (a.order || 0) - (b.order || 0))

  if (entitiesInTab.length === 0) return

  const currentIdx = entitiesInTab.findIndex(e => e.id === appState.focusedEntity)
  let newIdx

  if (direction === 'next') {
    newIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % entitiesInTab.length
  } else {
    newIdx = currentIdx < 0 ? entitiesInTab.length - 1 : (currentIdx - 1 + entitiesInTab.length) % entitiesInTab.length
  }

  const newEntityId = entitiesInTab[newIdx].id
  appState.focusedEntity = newEntityId

  const stage = findStageByEntity(tab, newEntityId)
  if (stage) {
    tab.activeStageId = stage.id
    const tile = layout.findTileByEntity(stage.layout, newEntityId)
    if (tile) {
      appState.focusedTile = tile.id
    }
  }

  saveState()
  broadcastState()
}
