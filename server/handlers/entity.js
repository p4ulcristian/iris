/**
 * Entity spawn and management handlers.
 */

import {
  appState, saveState, broadcastState,
  generateEntityId, getNextEntityNumber, generateStageId, getNextOrder,
  getEntityRegistry
} from '../state.js'
import * as layout from '../layout.js'

// Helper to get entity type info from registry (with fallback)
function getEntityType(type) {
  const registry = getEntityRegistry()
  return registry[type] || { label: type, icon: null, color: '#888888' }
}

export const handlers = {
  // Spawn a view entity (browser, git, history, linear, settings)
  'entity:spawn': (ws, data) => {
    const type = data.type
    const entityTypeInfo = getEntityType(type)
    if (!entityTypeInfo.label || type === 'god' || type === 'terminal') {
      // Use god:spawn or terminal:spawn for those
      return
    }

    const entityId = generateEntityId(type)
    const num = getNextEntityNumber(type)

    appState.entities[entityId] = {
      id: entityId,
      type,
      name: data.name || `${entityTypeInfo.label}-${num}`,
      tabId: appState.activeTabId,
      order: getNextOrder(appState.activeTabId),
      spawnedAt: Date.now(),
      // Type-specific data
      url: data.url || null,
      project: data.project || null,
      data: data.data || null  // Custom data for entity
    }

    // Create a new stage for this entity
    const tab = appState.tabs.find(t => t.id === appState.activeTabId)
    if (tab) {
      const stageId = generateStageId()
      const tileNode = layout.createTile([entityId], entityId)
      const newStage = { id: stageId, layout: tileNode }
      tab.stages.push(newStage)
      tab.activeStageId = stageId
      appState.focusedTile = tileNode.id
    }

    appState.focusedEntity = entityId
    saveState()
    broadcastState()
  },

  // Update browser entity URL
  'browser:navigate': (ws, data) => {
    const entityId = data.entityId
    const url = data.url
    if (entityId && url && appState.entities[entityId]?.type === 'browser') {
      appState.entities[entityId].url = url
      saveState()
      broadcastState()
    }
  },

  // Update entity data (for pomodoro, todo, etc.)
  'entity:update-data': (ws, data) => {
    const entityId = data.entityId
    const entityData = data.data
    if (entityId && appState.entities[entityId]) {
      appState.entities[entityId].data = entityData
      saveState()
      broadcastState()
    }
  },
}
