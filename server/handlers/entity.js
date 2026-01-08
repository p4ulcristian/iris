/**
 * Entity spawn and management handlers.
 */

import {
  appState, saveState, broadcastState,
  generateEntityId, getNextEntityNumber,
  getEntityRegistry
} from '../state.js'
import {
  createEntityBase,
  addEntity,
  createStageForEntity,
  finalizeSpawn
} from '../../entities/_shared/index.js'

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

    const entity = createEntityBase(entityId, type, {
      name: data.name || `${entityTypeInfo.label}-${num}`,
      extra: {
        color: entityTypeInfo.color,
        url: data.url || null,
        project: data.project || null,
        data: data.data || null
      }
    })
    addEntity(entityId, entity)
    createStageForEntity(entityId)
    finalizeSpawn(entityId)
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
