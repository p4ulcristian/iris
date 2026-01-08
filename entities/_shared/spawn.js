/**
 * Shared entity spawn utilities.
 * Consolidates duplicated spawn logic from god.js and entity.js handlers.
 */

import {
  appState, saveState, broadcastState,
  generateStageId, getNextOrder
} from '../../server/state.js'
import * as layout from '../../server/layout.js'

/**
 * Create base entity object with common fields.
 * @param {string} id - Entity ID
 * @param {string} type - Entity type (god, terminal, browser, etc.)
 * @param {Object} data - Entity-specific data
 * @returns {Object} Entity object
 */
export function createEntityBase(id, type, data = {}) {
  return {
    id,
    type,
    name: data.name || id,
    tabId: data.tabId ?? appState.activeTabId,
    order: data.order ?? getNextOrder(data.tabId ?? appState.activeTabId),
    spawnedAt: Date.now(),
    ...data.extra
  }
}

/**
 * Add entity to appState.entities.
 * @param {string} id - Entity ID
 * @param {Object} entity - Entity object
 */
export function addEntity(id, entity) {
  appState.entities[id] = entity
}

/**
 * Create a new stage for an entity in the specified tab.
 * @param {string} entityId - Entity ID to add to stage
 * @param {number} [tabId] - Tab ID (defaults to activeTabId)
 * @returns {{ stageId: string, tileNode: Object } | null}
 */
export function createStageForEntity(entityId, tabId) {
  const targetTabId = tabId ?? appState.activeTabId
  const tab = appState.tabs.find(t => t.id === targetTabId)
  if (!tab) return null

  const stageId = generateStageId()
  const tileNode = layout.createTile([entityId], entityId)
  const newStage = { id: stageId, layout: tileNode }

  tab.stages = tab.stages || []
  tab.stages.push(newStage)
  tab.activeStageId = stageId
  appState.focusedTile = tileNode.id

  return { stageId, tileNode }
}

/**
 * Set focus to entity and persist state.
 * @param {string} entityId - Entity to focus
 */
export function finalizeSpawn(entityId) {
  appState.focusedEntity = entityId
  saveState()
  broadcastState()
}

/**
 * Complete spawn flow: add entity, create stage, set focus, save.
 * @param {string} id - Entity ID
 * @param {string} type - Entity type
 * @param {Object} data - Entity data
 * @returns {Object} The created entity
 */
export function spawnEntity(id, type, data = {}) {
  const entity = createEntityBase(id, type, data)
  addEntity(id, entity)
  createStageForEntity(id, entity.tabId)
  finalizeSpawn(id)
  return entity
}
