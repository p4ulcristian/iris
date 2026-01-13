/**
 * Layout management handlers (tile splits, merges, moves).
 */

import { GOD_COLORS, PANTHEON } from '../config.js'
import {
  appState, saveState, broadcastState,
  generateEntityId, getNextEntityNumber, generateStageId, getNextOrder,
  findStageByEntity, getActiveStage, getEntityRegistry,
  generateGodId, getGodDisplayName, getBaseGodName
} from '../state.js'
import * as layout from '../layout.js'
import { createGodSession, createTerminalSession } from '../gods.js'
import { clearOutputBuffer } from '../pty.js'
import {
  createEntityBase,
  addEntity,
  createStageForEntity,
  splitIntoTile,
  finalizeSpawn
} from '../../entities/_shared/index.js'

// Helper to get entity type info from registry (with fallback)
function getEntityType(type) {
  const registry = getEntityRegistry()
  return registry[type] || { label: type, icon: null, color: '#888888' }
}

// Helper to create generic entity (used in layout handlers)
function createGenericEntity(entityType, tabId) {
  const entityId = generateEntityId(entityType)
  const num = getNextEntityNumber(entityType)
  const typeInfo = getEntityType(entityType)

  const entity = createEntityBase(entityId, entityType, {
    name: `${typeInfo.label || entityType}-${num}`,
    tabId
  })
  addEntity(entityId, entity)
  return entityId
}

export const handlers = {
  'layout:init': (ws, data, projectRoot) => {
    const { tabId, entityId, entityType, mode = 'split', direction = 'horizontal' } = data
    const tab = appState.tabs.find(t => t.id === (tabId || appState.activeTabId))
    if (!tab) return

    // Helper to place entity based on mode
    const placeEntity = (entityId, tabId) => {
      if (mode === 'stage') {
        createStageForEntity(entityId, tabId)
      } else {
        splitIntoTile(entityId, tabId, { direction })
      }
    }

    let targetEntityId = entityId
    if (entityType && !entityId) {
      if (entityType === 'god') {
        // Pick from unused gods first, then random if all taken
        const pantheonNames = Object.keys(PANTHEON)
        const usedBaseNames = new Set(
          Object.keys(appState.entities)
            .filter(id => appState.entities[id].type === 'god')
            .map(id => getBaseGodName(id))
        )
        const available = pantheonNames.filter(n => !usedBaseNames.has(n))
        const baseName = available.length > 0
          ? available[Math.floor(Math.random() * available.length)]
          : pantheonNames[Math.floor(Math.random() * pantheonNames.length)] || 'zeus'
        const entityId = generateGodId(baseName)
        const displayName = getGodDisplayName(entityId)

        clearOutputBuffer(entityId)
        const god = createGodSession(entityId, '', projectRoot, {
          startPrompt: appState.settings?.startPrompt,
          userName: appState.settings?.userName
        })
        if (god && !god.exists) {
          const entity = createEntityBase(entityId, 'god', {
            name: displayName,
            extra: {
              mission: null,
              sessionId: god.sessionId || null,
              project: projectRoot,
              readyState: 'working'
            }
          })
          addEntity(entityId, entity)
          placeEntity(entityId, tab.id)
          finalizeSpawn(entityId)
        }
        return
      } else if (entityType === 'terminal') {
        const terminal = createTerminalSession({}, projectRoot)
        if (terminal && !terminal.exists) {
          const entity = createEntityBase(terminal.name, 'terminal', {
            name: terminal.displayName || terminal.name,
            extra: { color: terminal.color }
          })
          addEntity(terminal.name, entity)
          placeEntity(terminal.name, tab.id)
          finalizeSpawn(terminal.name)
        }
        return
      } else {
        // Generic entity
        targetEntityId = createGenericEntity(entityType, appState.activeTabId)
        placeEntity(targetEntityId, tab.id)
        finalizeSpawn(targetEntityId)
        return
      }
    }

    // If moving existing entity, place based on mode
    if (targetEntityId) {
      placeEntity(targetEntityId, tab.id)
      finalizeSpawn(targetEntityId)
    } else {
      saveState()
      broadcastState()
    }
  },

  'layout:split': (ws, data, projectRoot) => {
    const { tabId, tileId, paneId, direction, position, entityId, entityType } = data
    const targetTileId = tileId || paneId
    const tab = appState.tabs.find(t => t.id === (tabId || appState.activeTabId))
    if (!tab) return

    let activeStage = getActiveStage(tab)
    if (!activeStage?.layout) return

    // Check if dropping entity onto its own tile (no-op)
    if (entityId) {
      const targetTile = layout.findTile(activeStage.layout, targetTileId)
      if (targetTile?.node?.entityId === entityId) {
        return
      }
    }

    // Create or get the entity to place in new tile
    let targetEntityId = entityId
    if (entityType && !entityId) {
      // Handle god/terminal spawns properly (need Zellij session, colors, etc.)
      if (entityType === 'god') {
        // Pick from unused gods first, then random if all taken
        const pantheonNames = Object.keys(PANTHEON)
        const usedBaseNames = new Set(
          Object.keys(appState.entities)
            .filter(id => appState.entities[id].type === 'god')
            .map(id => getBaseGodName(id))
        )
        const available = pantheonNames.filter(n => !usedBaseNames.has(n))
        const baseName = available.length > 0
          ? available[Math.floor(Math.random() * available.length)]
          : pantheonNames[Math.floor(Math.random() * pantheonNames.length)] || 'zeus'
        const godEntityId = generateGodId(baseName)
        const displayName = getGodDisplayName(godEntityId)

        clearOutputBuffer(godEntityId)
        const god = createGodSession(godEntityId, '', projectRoot, {
          startPrompt: appState.settings?.startPrompt,
          userName: appState.settings?.userName
        })
        if (god && !god.exists) {
          const entity = createEntityBase(godEntityId, 'god', {
            name: displayName,
            tabId: tab.id,
            extra: {
              mission: null,
              sessionId: god.sessionId || null,
              project: projectRoot,
              readyState: 'working'
            }
          })
          addEntity(godEntityId, entity)
          targetEntityId = godEntityId
        } else {
          return // God creation failed or already exists
        }
      } else if (entityType === 'terminal') {
        const terminal = createTerminalSession({}, projectRoot)
        if (terminal && !terminal.exists) {
          const entity = createEntityBase(terminal.name, 'terminal', {
            name: terminal.displayName || terminal.name,
            tabId: tab.id,
            extra: { color: terminal.color }
          })
          addEntity(terminal.name, entity)
          targetEntityId = terminal.name
        } else {
          return // Terminal creation failed or already exists
        }
      } else {
        // Generic entity (browser, settings, etc.)
        targetEntityId = createGenericEntity(entityType, tab.id)
      }
    }

    // If moving an existing entity, remove it from its current stage first
    if (entityId) {
      const sourceStage = findStageByEntity(tab, entityId)
      if (sourceStage) {
        const sourceIsActive = sourceStage.id === activeStage.id
        sourceStage.layout = layout.removeEntityFromLayout(sourceStage.layout, entityId)
        if (!sourceStage.layout) {
          tab.stages = tab.stages.filter(s => s.id !== sourceStage.id)
          if (sourceIsActive) {
            activeStage = getActiveStage(tab)
            if (!activeStage) {
              const stageId = generateStageId()
              const tileNode = layout.createTile(null)
              const newStage = { id: stageId, layout: tileNode }
              tab.stages.push(newStage)
              tab.activeStageId = stageId
              activeStage = newStage
            }
          }
        }
      }
    }

    // Split the tile in active stage
    if (activeStage?.layout) {
      activeStage.layout = layout.splitTile(activeStage.layout, targetTileId, direction, position, targetEntityId)
    } else {
      activeStage.layout = layout.createTile(targetEntityId)
    }

    // Focus the new tile and entity
    const newTile = layout.findTileByEntity(activeStage.layout, targetEntityId)
    if (newTile) {
      appState.focusedTile = newTile.id
      appState.focusedEntity = targetEntityId
    }

    saveState()
    broadcastState()
  },

  'layout:rearrange': (ws, data) => {
    const { tabId, sourceTileId, targetTileId, direction, position, entityId } = data
    const tab = appState.tabs.find(t => t.id === (tabId || appState.activeTabId))
    if (!tab || !entityId) return

    let activeStage = getActiveStage(tab)
    if (!activeStage?.layout) return

    // Don't allow dropping on self
    if (sourceTileId === targetTileId) return

    // Remove entity from its current position in the layout
    activeStage.layout = layout.removeEntityFromLayout(activeStage.layout, entityId)

    // If removing the entity made the layout null, create fresh layout at target
    if (!activeStage.layout) {
      activeStage.layout = layout.createTile([entityId], entityId)
    } else {
      activeStage.layout = layout.splitTile(activeStage.layout, targetTileId, direction, position, entityId)
    }

    // Focus the new tile and entity
    const newTile = layout.findTileByEntity(activeStage.layout, entityId)
    if (newTile) {
      appState.focusedTile = newTile.id
      appState.focusedEntity = entityId
    }

    saveState()
    broadcastState()
  },

  'layout:merge': (ws, data) => {
    const { tabId, tileId, paneId } = data
    const targetTileId = tileId || paneId
    const tab = appState.tabs.find(t => t.id === (tabId || appState.activeTabId))
    if (!tab) return

    const activeStage = getActiveStage(tab)
    if (!activeStage?.layout) return

    const { layout: newLayout } = layout.mergeTile(activeStage.layout, targetTileId)
    activeStage.layout = newLayout

    // Update focused tile if it was merged
    if (appState.focusedTile === targetTileId) {
      const firstTile = layout.getFirstTile(activeStage.layout)
      appState.focusedTile = firstTile?.id || null
      appState.focusedEntity = firstTile?.entityId || firstTile?.focusedEntityId || firstTile?.entityIds?.[0] || null
    }

    saveState()
    broadcastState()
  },

  'layout:resize': (ws, data) => {
    const { tabId, splitId, ratio } = data
    const tab = appState.tabs.find(t => t.id === (tabId || appState.activeTabId))
    if (!tab) return

    const activeStage = getActiveStage(tab)
    if (!activeStage?.layout) return

    activeStage.layout = layout.updateSplitRatio(activeStage.layout, splitId, ratio)

    saveState()
    broadcastState()
  },

  'layout:move-entity': (ws, data) => {
    const { entityId, targetTileId, targetPaneId, dropPosition } = data
    const targetId = targetTileId || targetPaneId
    const tab = appState.tabs.find(t => t.id === appState.activeTabId)
    if (!tab || !entityId) return

    const activeStage = getActiveStage(tab)
    if (!activeStage?.layout) return

    // Remove from source stage first
    const sourceStage = findStageByEntity(tab, entityId)
    if (sourceStage) {
      sourceStage.layout = layout.removeEntityFromLayout(sourceStage.layout, entityId)
      if (!sourceStage.layout) {
        tab.stages = tab.stages.filter(s => s.id !== sourceStage.id)
      }
    }

    if (dropPosition === 'center') {
      activeStage.layout = layout.addEntityToTile(activeStage.layout, targetId, entityId)
    } else {
      const direction = (dropPosition === 'left' || dropPosition === 'right') ? 'horizontal' : 'vertical'
      activeStage.layout = layout.splitTile(activeStage.layout, targetId, direction, dropPosition, entityId)
    }

    // Update focus
    const newTile = layout.findTileByEntity(activeStage.layout, entityId)
    if (newTile) {
      appState.focusedTile = newTile.id
      appState.focusedEntity = entityId
    }

    saveState()
    broadcastState()
  },

  'tile:focus-entity': (ws, data) => {
    handlers['pane:focus-entity'](ws, data)
  },

  'pane:focus-entity': (ws, data) => {  // Legacy alias
    const tileId = data.tileId || data.paneId
    const { entityId } = data
    const tab = appState.tabs.find(t => t.id === appState.activeTabId)
    if (!tab) return

    const activeStage = getActiveStage(tab)
    if (!activeStage?.layout) return

    activeStage.layout = layout.setFocusedEntityInTile(activeStage.layout, tileId, entityId)
    appState.focusedTile = tileId
    appState.focusedEntity = entityId

    saveState()
    broadcastState()
  },

  'layout:add-entity-to-tile': (ws, data) => {
    handlers['layout:add-entity-to-pane'](ws, data)
  },

  'layout:add-entity-to-pane': (ws, data) => {  // Legacy alias
    const tileId = data.tileId || data.paneId
    const { entityId, entityType } = data
    const tab = appState.tabs.find(t => t.id === appState.activeTabId)
    if (!tab) return

    const activeStage = getActiveStage(tab)
    if (!activeStage?.layout) return

    // Create entity if type provided
    let targetEntityId = entityId
    if (entityType && !entityId) {
      targetEntityId = createGenericEntity(entityType, tab.id)
    } else if (entityId) {
      // Moving existing entity - remove from its source stage first
      const sourceStage = findStageByEntity(tab, entityId)
      if (sourceStage) {
        sourceStage.layout = layout.removeEntityFromLayout(sourceStage.layout, entityId)
        if (!sourceStage.layout) {
          tab.stages = tab.stages.filter(s => s.id !== sourceStage.id)
        }
      }
    }

    // Add to tile in active stage
    activeStage.layout = layout.addEntityToTile(activeStage.layout, tileId, targetEntityId)

    appState.focusedTile = tileId
    appState.focusedEntity = targetEntityId

    saveState()
    broadcastState()
  },

  // Split entity out of a multi-entity stage into its own new stage
  'stage:split': (ws, data) => {
    const { entityId, stageId } = data
    if (!entityId) return

    const tab = appState.tabs.find(t => t.id === appState.activeTabId)
    if (!tab) return

    const sourceStage = stageId
      ? tab.stages.find(s => s.id === stageId)
      : findStageByEntity(tab, entityId)
    if (!sourceStage?.layout) return

    // Capture sibling to focus before removal (if source has multiple entities)
    const sourceEntityIds = layout.getAllEntityIds(sourceStage.layout)
    const siblingToFocus = sourceEntityIds.find(id => id !== entityId)

    // Remove entity from source stage's layout
    sourceStage.layout = layout.removeEntityFromLayout(sourceStage.layout, entityId)

    // If source stage is now empty, remove it
    if (!sourceStage.layout) {
      tab.stages = tab.stages.filter(s => s.id !== sourceStage.id)
    }

    // Create a new stage for the split-out entity
    const newStageId = generateStageId()
    const tileNode = layout.createTile([entityId], entityId)
    const newStage = { id: newStageId, layout: tileNode }
    tab.stages.push(newStage)

    // Keep focus on source stage if it still has entities, else focus the dragged entity
    if (siblingToFocus && sourceStage.layout) {
      appState.focusedEntity = siblingToFocus
      // activeStageId stays on source
    } else {
      tab.activeStageId = newStageId
      appState.focusedTile = tileNode.id
      appState.focusedEntity = entityId
    }

    saveState()
    broadcastState()
  },

  // Reorder an entity within its stage
  'stage:reorder-entity': (ws, data) => {
    const { stageId, entityId, targetIndex } = data
    if (!stageId || !entityId || targetIndex === undefined) return

    const tab = appState.tabs.find(t => t.id === appState.activeTabId)
    if (!tab) return

    const stage = tab.stages.find(s => s.id === stageId)
    if (!stage?.layout) return

    const entityIds = layout.getAllEntityIds(stage.layout)
      .sort((a, b) => (appState.entities[a]?.order ?? 0) - (appState.entities[b]?.order ?? 0))
    const currentIndex = entityIds.indexOf(entityId)
    if (currentIndex === -1) return

    console.log('[reorder] BEFORE:', entityIds.map(id => appState.entities[id]?.name || id))
    console.log('[reorder] dragged:', entityId, 'currentIndex:', currentIndex, 'targetIndex:', targetIndex)

    entityIds.splice(currentIndex, 1)
    const insertAt = targetIndex > currentIndex ? targetIndex - 1 : targetIndex
    console.log('[reorder] insertAt:', insertAt)
    entityIds.splice(insertAt, 0, entityId)
    console.log('[reorder] AFTER:', entityIds.map(id => appState.entities[id]?.name || id))

    entityIds.forEach((id, idx) => {
      if (appState.entities[id]) {
        appState.entities[id].order = idx
      }
    })

    saveState()
    broadcastState()
  },

  // Move entity from one stage to another at a specific position
  'stage:join': (ws, data) => {
    const { entityId, sourceStageId, targetStageId, targetIndex } = data
    if (!entityId || !sourceStageId || !targetStageId) return

    const tab = appState.tabs.find(t => t.id === appState.activeTabId)
    if (!tab) return

    const sourceStage = tab.stages.find(s => s.id === sourceStageId)
    const targetStage = tab.stages.find(s => s.id === targetStageId)
    if (!sourceStage?.layout || !targetStage?.layout) return

    // Capture sibling to focus before removal (if source has multiple entities)
    const sourceEntityIds = layout.getAllEntityIds(sourceStage.layout)
    const siblingToFocus = sourceEntityIds.find(id => id !== entityId)

    // Remove entity from source stage
    sourceStage.layout = layout.removeEntityFromLayout(sourceStage.layout, entityId)

    // If source stage is now empty, remove it
    if (!sourceStage.layout) {
      tab.stages = tab.stages.filter(s => s.id !== sourceStage.id)
    }

    // Add entity to target stage's layout
    const targetEntityIds = layout.getAllEntityIds(targetStage.layout)
    const insertAt = Math.min(targetIndex ?? targetEntityIds.length, targetEntityIds.length)

    // Update order values for the target stage entities
    targetEntityIds.forEach((id, idx) => {
      if (appState.entities[id]) {
        if (idx >= insertAt) {
          appState.entities[id].order = idx + 1
        } else {
          appState.entities[id].order = idx
        }
      }
    })

    // Set the joining entity's order
    if (appState.entities[entityId]) {
      appState.entities[entityId].order = insertAt
    }

    // Add entity to target stage layout (to the first tile for now)
    const firstTile = layout.getFirstTile(targetStage.layout)
    if (firstTile) {
      targetStage.layout = layout.addEntityToTile(targetStage.layout, firstTile.id, entityId)
    }

    // Keep focus on source stage if it still has entities, else focus the target
    if (siblingToFocus && sourceStage.layout) {
      appState.focusedEntity = siblingToFocus
      // activeStageId stays on source
    } else {
      tab.activeStageId = targetStageId
      appState.focusedEntity = entityId
    }

    saveState()
    broadcastState()
  },

  // Create a new solo stage at a specific position (for reordering via drag)
  'stage:create-at-position': (ws, data) => {
    const { entityId, sourceStageId, position } = data
    if (!entityId || position === undefined) return

    const tab = appState.tabs.find(t => t.id === appState.activeTabId)
    if (!tab) return

    // Find source stage and its position
    const sourceStage = sourceStageId
      ? tab.stages.find(s => s.id === sourceStageId)
      : findStageByEntity(tab, entityId)

    // Capture sibling to focus before removal (if source has multiple entities)
    const sourceEntityIds = sourceStage?.layout ? layout.getAllEntityIds(sourceStage.layout) : []
    const siblingToFocus = sourceEntityIds.find(id => id !== entityId)

    // Get source stage's sorted position
    const sortedStages = [...tab.stages].sort((a, b) => {
      const aIds = layout.getAllEntityIds(a.layout)
      const bIds = layout.getAllEntityIds(b.layout)
      const aOrder = aIds.length > 0 ? (appState.entities[aIds[0]]?.order ?? 0) : 0
      const bOrder = bIds.length > 0 ? (appState.entities[bIds[0]]?.order ?? 0) : 0
      return aOrder - bOrder
    })
    const sourcePosition = sortedStages.findIndex(s => s.id === sourceStage?.id)

    console.log('[create-at-position] sourcePosition:', sourcePosition, 'targetPosition:', position)

    if (sourceStage?.layout) {
      sourceStage.layout = layout.removeEntityFromLayout(sourceStage.layout, entityId)

      // If source stage is now empty, remove it
      if (!sourceStage.layout) {
        tab.stages = tab.stages.filter(s => s.id !== sourceStage.id)
      }
    }

    // Create a new stage for this entity
    const newStageId = generateStageId()
    const tileNode = layout.createTile(entityId)
    const newStage = { id: newStageId, layout: tileNode }

    // Adjust position if source was before target (moving down)
    let targetOrder = position
    if (sourcePosition !== -1 && sourcePosition < position) {
      targetOrder = position - 1
    }
    console.log('[create-at-position] targetOrder:', targetOrder)

    // Append the new stage
    tab.stages.push(newStage)

    // Build sorted list of all stages (excluding the moved entity for now)
    const otherStages = tab.stages
      .filter(s => s.id !== newStage.id)
      .map(stage => {
        const ids = layout.getAllEntityIds(stage.layout)
        const order = ids.length > 0 ? (appState.entities[ids[0]]?.order ?? 999) : 999
        return { stage, ids, order }
      })
      .sort((a, b) => a.order - b.order)

    // Insert the moved entity at targetOrder position
    const movedEntity = { stage: newStage, ids: [entityId], order: targetOrder }
    otherStages.splice(targetOrder, 0, movedEntity)

    // Reassign sequential orders
    console.log('[create-at-position] final order:', otherStages.map(s => appState.entities[s.ids[0]]?.name || s.ids[0]))
    otherStages.forEach((item, idx) => {
      item.ids.forEach(id => {
        if (appState.entities[id]) {
          appState.entities[id].order = idx
        }
      })
    })

    // Keep focus on source stage if it still has entities, else focus the new stage
    if (siblingToFocus && sourceStage?.layout) {
      appState.focusedEntity = siblingToFocus
      // activeStageId stays on source
    } else {
      tab.activeStageId = newStageId
      appState.focusedTile = tileNode.id
      appState.focusedEntity = entityId
    }

    saveState()
    broadcastState()
  },

  'layout:toggle-maximize': (ws, data) => {
    // Use provided tileId or fall back to server's focused tile
    const tileId = data.tileId || appState.focusedTile
    if (!tileId) return

    // Toggle: if already maximized, clear; else set
    appState.maximizedTile = appState.maximizedTile === tileId ? null : tileId

    saveState()
    broadcastState()
  },
}
