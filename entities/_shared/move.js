/**
 * Shared entity move utilities.
 * Consolidates duplicated move logic from god.js handlers.
 */

import {
  appState, saveState, broadcastState,
  generateStageId, getNextOrder, normalizeTabOrder,
  findStageByEntity, deleteTabIfEmpty
} from '../../server/state.js'
import * as layout from '../../server/layout.js'

/**
 * Remove an entity from its current stage layout.
 * Removes the stage entirely if it becomes empty.
 * @param {string} entityId - Entity ID to remove
 * @param {number} tabId - Tab ID containing the entity
 * @returns {boolean} True if removed successfully
 */
export function removeFromStage(entityId, tabId) {
  const tab = appState.tabs.find(t => t.id === tabId)
  if (!tab) return false

  const stage = findStageByEntity(tab, entityId)
  if (!stage) return false

  stage.layout = layout.removeEntityFromLayout(stage.layout, entityId)

  // Remove stage if empty
  if (!stage.layout) {
    tab.stages = tab.stages.filter(s => s.id !== stage.id)
    if (tab.activeStageId === stage.id) {
      tab.activeStageId = tab.stages[0]?.id || null
    }
  }

  return true
}

/**
 * Move an entity to a different tab.
 * Handles stage removal, creation, order normalization, and empty tab cleanup.
 * @param {string} entityId - Entity ID to move
 * @param {number} destTabId - Destination tab ID
 */
export function moveToTab(entityId, destTabId) {
  const entity = appState.entities[entityId]
  if (!entity) return

  const sourceTabId = entity.tabId

  // Remove from source stage
  removeFromStage(entityId, sourceTabId)

  // Update entity's tab and order
  entity.tabId = destTabId
  entity.order = getNextOrder(destTabId)

  // Create new stage in destination
  const destTab = appState.tabs.find(t => t.id === destTabId)
  if (destTab) {
    const stageId = generateStageId()
    const tileNode = layout.createTile([entityId], entityId)
    const newStage = { id: stageId, layout: tileNode }
    destTab.stages = destTab.stages || []
    destTab.stages.push(newStage)
    destTab.activeStageId = stageId
    appState.focusedTile = tileNode.id
  }

  // Normalize and cleanup
  normalizeTabOrder(sourceTabId)
  normalizeTabOrder(destTabId)
  deleteTabIfEmpty(sourceTabId)

  appState.focusedEntity = entityId
  saveState()
  broadcastState()
}

/**
 * Move an entity to a new tab.
 * Creates the tab, moves the entity, and cleans up the source.
 * @param {string} entityId - Entity ID to move
 * @param {Function} getTabName - Function to generate tab name
 */
export function moveToNewTab(entityId, getTabName) {
  const entity = appState.entities[entityId]
  if (!entity) return

  const sourceTabId = entity.tabId

  // Remove from source stage
  removeFromStage(entityId, sourceTabId)

  // Create new tab
  appState.tabCounter++
  const stageId = generateStageId()
  const tileNode = layout.createTile([entityId], entityId)
  const newTab = {
    id: appState.tabCounter,
    name: getTabName(),
    stages: [{ id: stageId, layout: tileNode }],
    activeStageId: stageId
  }
  appState.tabs.push(newTab)
  appState.activeTabId = newTab.id
  appState.focusedTile = tileNode.id

  // Update entity
  entity.tabId = newTab.id
  entity.order = 0

  // Cleanup source
  if (sourceTabId) {
    normalizeTabOrder(sourceTabId)
    deleteTabIfEmpty(sourceTabId)
  }

  appState.focusedEntity = entityId
  saveState()
  broadcastState()
}
