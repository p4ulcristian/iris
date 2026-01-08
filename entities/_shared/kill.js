/**
 * Shared entity kill/cleanup utilities.
 * Consolidates duplicated kill logic from god.js handlers.
 */

import {
  appState, saveState, broadcastState,
  normalizeTabOrder, findStageByEntity, deleteTabIfEmpty
} from '../../server/state.js'
import * as layout from '../../server/layout.js'
import { getAllEntityIds } from '../../server/layout.js'

/**
 * Remove an entity from state and update focus.
 * Does NOT handle type-specific cleanup (PTY, sessions) - caller must do that.
 * @param {string} entityId - Entity ID to remove
 * @returns {{ entity: Object, tabId: number } | null} Removed entity info
 */
export function removeEntity(entityId) {
  const entity = appState.entities[entityId]
  if (!entity) return null

  const tabId = entity.tabId
  const order = entity.order || 0

  // Capture stage siblings BEFORE removal (for focus fallback)
  let stageSiblings = []
  if (tabId) {
    const tab = appState.tabs.find(t => t.id === tabId)
    if (tab) {
      const stage = findStageByEntity(tab, entityId)
      if (stage) {
        stageSiblings = getAllEntityIds(stage.layout).filter(id => id !== entityId)
      }
    }
  }

  // Remove from state
  delete appState.entities[entityId]

  // Remove from stage layout
  if (tabId) {
    const tab = appState.tabs.find(t => t.id === tabId)
    if (tab) {
      const stage = findStageByEntity(tab, entityId)
      if (stage) {
        stage.layout = layout.removeEntityFromLayout(stage.layout, entityId)
        if (!stage.layout) {
          tab.stages = tab.stages.filter(s => s.id !== stage.id)
          if (tab.activeStageId === stage.id) {
            tab.activeStageId = tab.stages[0]?.id || null
          }
        }
      }
      normalizeTabOrder(tabId)
      deleteTabIfEmpty(tabId)
    }
  }

  // Update focus if needed
  if (appState.focusedEntity === entityId) {
    updateFocusAfterKill(tabId, order, stageSiblings)
  }

  return { entity, tabId }
}

/**
 * Update focused entity after killing one.
 * Prioritizes siblings in the same stage, then falls back to tab-level order.
 * @param {number} tabId - Tab the killed entity was in
 * @param {number} killedOrder - Order of the killed entity
 * @param {string[]} stageSiblings - Entity IDs that were in the same stage
 */
export function updateFocusAfterKill(tabId, killedOrder, stageSiblings = []) {
  let newFocused = null

  // First priority: stay in the same stage
  if (stageSiblings.length > 0) {
    newFocused = stageSiblings[0]
  } else {
    // Fall back to tab-level: find entity with order just below killed one
    const remaining = Object.entries(appState.entities)
      .filter(([_, e]) => e.tabId === tabId)
      .sort((a, b) => (a[1].order || 0) - (b[1].order || 0))

    for (let i = remaining.length - 1; i >= 0; i--) {
      if ((remaining[i][1].order || 0) < killedOrder) {
        newFocused = remaining[i][0]
        break
      }
    }
    if (!newFocused && remaining.length > 0) {
      newFocused = remaining[0][0]
    }
  }

  appState.focusedEntity = newFocused

  // Update active stage to match focused entity
  if (appState.focusedEntity && tabId === appState.activeTabId) {
    const tab = appState.tabs.find(t => t.id === appState.activeTabId)
    if (tab) {
      const stage = findStageByEntity(tab, appState.focusedEntity)
      if (stage) {
        tab.activeStageId = stage.id
      }
    }
  }
}

/**
 * Complete kill flow: remove entity and persist.
 * Does NOT handle type-specific cleanup - caller must do that first.
 * @param {string} entityId - Entity ID to kill
 */
export function killEntity(entityId) {
  removeEntity(entityId)
  saveState()
  broadcastState()
}
