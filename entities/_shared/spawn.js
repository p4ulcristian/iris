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
 * Split the focused tile and place entity there.
 * If no tiles exist, creates a root tile.
 * @param {string} entityId - Entity ID to place
 * @param {number} [tabId] - Tab ID (defaults to activeTabId)
 * @param {Object} [options] - Split options
 * @param {string} [options.direction='horizontal'] - Split direction
 * @param {string} [options.position='after'] - Position relative to existing tile
 */
export function splitIntoTile(entityId, tabId, options = {}) {
  const { direction = 'horizontal', position = 'after' } = options
  const targetTabId = tabId ?? appState.activeTabId
  const tab = appState.tabs.find(t => t.id === targetTabId)
  if (!tab) return null

  // Ensure we have an active stage
  let activeStage = tab.stages?.find(s => s.id === tab.activeStageId)
  if (!activeStage) {
    // No active stage - create one with root tile
    const stageId = generateStageId()
    const tileNode = layout.createTile(entityId)
    const newStage = { id: stageId, layout: tileNode }
    tab.stages = tab.stages || []
    tab.stages.push(newStage)
    tab.activeStageId = stageId
    appState.focusedTile = tileNode.id
    return { stageId, tileNode }
  }

  // Get the focused tile or the first tile if none focused
  const allTiles = layout.getAllTiles(activeStage.layout)
  const targetTileId = appState.focusedTile && allTiles.some(t => t.id === appState.focusedTile)
    ? appState.focusedTile
    : allTiles[0]?.id

  if (!targetTileId || !activeStage.layout) {
    // No tiles exist - create root tile
    activeStage.layout = layout.createTile(entityId)
    appState.focusedTile = activeStage.layout.id
  } else {
    // Split the focused tile
    activeStage.layout = layout.splitTile(
      activeStage.layout,
      targetTileId,
      direction,
      position,
      entityId
    )
    // Update focus to new tile
    const newTile = layout.findTileByEntity(activeStage.layout, entityId)
    if (newTile) {
      appState.focusedTile = newTile.id
    }
  }

  return { stageId: activeStage.id, layout: activeStage.layout }
}

/**
 * Set focus to entity and persist state.
 * @param {string} entityId - Entity to focus
 * @param {Object} [options] - Spawn options
 * @param {string} [options.mode='split'] - 'split' to split current tile, 'stage' to create new stage
 * @param {string} [options.direction='horizontal'] - Split direction when mode is 'split'
 * @param {string} [options.position='after'] - Position for split
 */
export function finalizeSpawn(entityId, options = {}) {
  const { mode = 'split', direction = 'horizontal', position = 'after' } = options

  // If mode is 'stage', create a new stage (old behavior)
  // If mode is 'split', the caller should have already called splitIntoTile()
  // This function just handles focus and persistence

  appState.focusedEntity = entityId
  saveState()
  broadcastState()
}

/**
 * Complete spawn flow: add entity, place in layout, set focus, save.
 * @param {string} id - Entity ID
 * @param {string} type - Entity type
 * @param {Object} data - Entity data
 * @param {Object} [spawnOptions] - Spawn options
 * @param {string} [spawnOptions.mode='split'] - 'split' to split current tile, 'stage' to create new stage
 * @param {string} [spawnOptions.direction='horizontal'] - Split direction when mode is 'split'
 * @returns {Object} The created entity
 */
export function spawnEntity(id, type, data = {}, spawnOptions = {}) {
  const { mode = 'split', direction = 'horizontal' } = spawnOptions
  const entity = createEntityBase(id, type, data)
  addEntity(id, entity)

  if (mode === 'stage') {
    createStageForEntity(id, entity.tabId)
  } else {
    splitIntoTile(id, entity.tabId, { direction })
  }

  finalizeSpawn(id)
  return entity
}
