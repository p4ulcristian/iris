/**
 * Surface Layout Tree Helpers
 *
 * Layout nodes are either:
 * - TileNode: { type: 'tile', id, entityId: string | null }
 * - SplitNode: { type: 'split', id, direction: 'horizontal' | 'vertical', ratio: number, children: [LayoutNode, LayoutNode] }
 *
 * Each tile holds exactly ONE entity. Stacking is achieved via stages (multiple stages per realm).
 */

import { generateTileId, generateSplitId } from './state.js'

/**
 * Create a new tile node with a single entity
 * @param {string|string[]} entityIdOrIds - Single entity ID (or array for backwards compat during migration)
 * @param {string} _focusedEntityId - Deprecated, kept for backwards compat during migration
 */
export function createTile(entityIdOrIds = null, _focusedEntityId = null) {
  // Handle backwards compatibility: if array passed, take first element
  const entityId = Array.isArray(entityIdOrIds)
    ? entityIdOrIds[0] || null
    : entityIdOrIds

  return {
    type: 'tile',
    id: generateTileId(),
    entityId
  }
}

// Alias for backwards compatibility
export const createPane = createTile

/**
 * Create a new split node
 */
export function createSplit(direction, children, ratio = 0.5) {
  return {
    type: 'split',
    id: generateSplitId(),
    direction,
    ratio,
    children
  }
}

/**
 * Find a node by ID in the layout tree
 * Returns { node, parent, index } or null if not found
 */
export function findNode(layout, nodeId, parent = null, index = -1) {
  if (!layout) return null

  if (layout.id === nodeId) {
    return { node: layout, parent, index }
  }

  if (layout.type === 'split') {
    for (let i = 0; i < layout.children.length; i++) {
      const result = findNode(layout.children[i], nodeId, layout, i)
      if (result) return result
    }
  }

  return null
}

/**
 * Find a tile by ID
 */
export function findTile(layout, tileId) {
  const result = findNode(layout, tileId)
  if (result && result.node.type === 'tile') {
    return result
  }
  return null
}

// Alias for backwards compatibility
export const findPane = findTile

/**
 * Find the tile containing a specific entity
 */
export function findTileByEntity(layout, entityId) {
  if (!layout) return null

  if (layout.type === 'tile') {
    // Support both new single entityId and legacy entityIds array
    if (layout.entityId === entityId) {
      return layout
    }
    // Backwards compat for legacy entityIds array
    if (layout.entityIds?.includes(entityId)) {
      return layout
    }
    return null
  }

  if (layout.type === 'split') {
    for (const child of layout.children) {
      const result = findTileByEntity(child, entityId)
      if (result) return result
    }
  }

  return null
}

// Alias for backwards compatibility
export const findPaneByEntity = findTileByEntity

/**
 * Get all tiles in the layout tree
 */
export function getAllTiles(layout) {
  if (!layout) return []

  if (layout.type === 'tile') {
    return [layout]
  }

  if (layout.type === 'split') {
    return layout.children.flatMap(child => getAllTiles(child))
  }

  return []
}

// Alias for backwards compatibility
export const getAllPanes = getAllTiles

/**
 * Get the first tile in the layout tree
 */
export function getFirstTile(layout) {
  if (!layout) return null

  if (layout.type === 'tile') {
    return layout
  }

  if (layout.type === 'split') {
    return getFirstTile(layout.children[0])
  }

  return null
}

// Alias for backwards compatibility
export const getFirstPane = getFirstTile

/**
 * Split a tile in a given direction and position
 * position: 'before' | 'after' | 'left' | 'right' | 'top' | 'bottom'
 * Returns a new layout tree (immutable)
 */
export function splitTile(layout, tileId, direction, position, newEntityId) {
  if (!layout) return layout

  // Normalize position to 'before' or 'after'
  const normalizedPosition = normalizePosition(position, direction)

  // Deep clone to avoid mutation
  const cloned = JSON.parse(JSON.stringify(layout))

  const result = findTile(cloned, tileId)
  if (!result) return cloned

  const { node: tile, parent, index } = result

  // Create new tile for the dropped entity (single entity)
  const newTile = createTile(newEntityId)

  // Create split node with old tile and new tile
  const children = normalizedPosition === 'before'
    ? [newTile, tile]
    : [tile, newTile]

  const splitNode = createSplit(direction, children, 0.5)

  // Replace tile with split node
  if (parent) {
    parent.children[index] = splitNode
  } else {
    // Tile was root node
    return splitNode
  }

  return cloned
}

// Alias for backwards compatibility
export const splitPane = splitTile

/**
 * Normalize position to 'before' or 'after' relative to direction
 */
function normalizePosition(position, direction) {
  switch (position) {
    case 'left':
    case 'top':
    case 'before':
      return 'before'
    case 'right':
    case 'bottom':
    case 'after':
      return 'after'
    default:
      return 'after'
  }
}

/**
 * Replace the entity in a tile (single entity per tile)
 * In the new model, each tile holds exactly one entity.
 * Returns a new layout tree (immutable)
 */
export function addEntityToTile(layout, tileId, entityId) {
  if (!layout) return layout

  const cloned = JSON.parse(JSON.stringify(layout))
  const result = findTile(cloned, tileId)

  if (!result) return cloned

  const { node: tile } = result

  // Replace the entity (single entity per tile now)
  tile.entityId = entityId

  return cloned
}

// Alias for backwards compatibility
export const addEntityToPane = addEntityToTile

/**
 * Remove an entity from any tile in the layout
 * Since each tile holds exactly one entity, removing it empties the tile.
 * Empty tiles are automatically collapsed (sibling takes over).
 * Returns a new layout tree (immutable) - never contains empty tiles
 */
export function removeEntityFromLayout(layout, entityId) {
  if (!layout) return layout

  // Recursive removal that collapses empty tiles atomically
  function removeAndCollapse(node, parent, childIndex) {
    if (node.type === 'tile') {
      // Check new single entityId format
      if (node.entityId === entityId) {
        // Tile becomes empty - return null to signal collapse
        return null
      }
      // Backwards compat: check legacy entityIds array
      if (node.entityIds?.includes(entityId)) {
        const newEntityIds = node.entityIds.filter(id => id !== entityId)
        if (newEntityIds.length > 0) {
          return {
            ...node,
            entityIds: newEntityIds,
            focusedEntityId: node.focusedEntityId === entityId
              ? newEntityIds[0]
              : node.focusedEntityId
          }
        } else {
          return null
        }
      }
      return node // Entity not here, keep as-is
    }

    if (node.type === 'split') {
      // Process children
      const newChildren = node.children.map((child, idx) =>
        removeAndCollapse(child, node, idx)
      )

      // If either child is null (was emptied), return the other
      if (newChildren[0] === null) return newChildren[1]
      if (newChildren[1] === null) return newChildren[0]

      // Both children exist - return updated split
      return { ...node, children: newChildren }
    }

    return node
  }

  const result = removeAndCollapse(JSON.parse(JSON.stringify(layout)), null, -1)

  // If entire layout collapsed to null, return null
  return result
}

/**
 * Move an entity from one tile to another
 * Returns a new layout tree (immutable)
 */
export function moveEntityToTile(layout, entityId, targetTileId) {
  if (!layout) return layout

  // First remove from current location
  let cloned = removeEntityFromLayout(layout, entityId)

  // Then add to target tile
  cloned = addEntityToTile(cloned, targetTileId, entityId)

  return cloned
}

// Alias for backwards compatibility
export const moveEntityToPane = moveEntityToTile

/**
 * Merge a tile into its sibling (collapse the split)
 * Returns { layout, mergedEntityIds } (immutable)
 */
export function mergeTile(layout, tileId) {
  if (!layout) return { layout, mergedEntityIds: [] }

  const cloned = JSON.parse(JSON.stringify(layout))
  const result = findNode(cloned, tileId)

  if (!result || !result.parent) {
    // Can't merge root node
    return { layout: cloned, mergedEntityIds: [] }
  }

  const { parent: splitNode, index } = result
  const tileToMerge = result.node
  const siblingIndex = index === 0 ? 1 : 0
  const sibling = splitNode.children[siblingIndex]

  // Get entities from the tile being merged
  let mergedEntityIds = []
  if (tileToMerge.type === 'tile') {
    // New single entityId format
    if (tileToMerge.entityId) {
      mergedEntityIds = [tileToMerge.entityId]
    }
    // Legacy entityIds array
    else if (tileToMerge.entityIds) {
      mergedEntityIds = [...tileToMerge.entityIds]
    }
  }

  // Find the grandparent to replace the split with the sibling
  const grandparentResult = findNode(cloned, splitNode.id)

  if (grandparentResult && grandparentResult.parent) {
    // Replace split with sibling in grandparent
    grandparentResult.parent.children[grandparentResult.index] = sibling
  } else {
    // Split was root, sibling becomes new root
    return { layout: sibling, mergedEntityIds }
  }

  return { layout: cloned, mergedEntityIds }
}

// Alias for backwards compatibility
export const mergePane = mergeTile

/**
 * Update the ratio of a split node
 * Returns a new layout tree (immutable)
 */
export function updateSplitRatio(layout, splitId, ratio) {
  if (!layout) return layout

  const cloned = JSON.parse(JSON.stringify(layout))
  const result = findNode(cloned, splitId)

  if (!result || result.node.type !== 'split') return cloned

  result.node.ratio = Math.max(0.1, Math.min(0.9, ratio))

  return cloned
}

/**
 * Set the focused entity in a tile
 * With single entity per tile, this is a no-op (kept for backwards compat)
 * Returns a new layout tree (immutable)
 */
export function setFocusedEntityInTile(layout, tileId, entityId) {
  if (!layout) return layout

  const cloned = JSON.parse(JSON.stringify(layout))
  const result = findTile(cloned, tileId)

  if (!result) return cloned

  const { node: tile } = result

  // With single entity per tile, just verify entity is in this tile
  if (tile.entityId === entityId) {
    // No-op, already the entity in this tile
    return cloned
  }

  // Backwards compat for legacy entityIds array
  if (tile.entityIds?.includes(entityId)) {
    tile.focusedEntityId = entityId
  }

  return cloned
}

// Alias for backwards compatibility
export const setFocusedEntityInPane = setFocusedEntityInTile

/**
 * Initialize layout from a single entity (new model)
 * For multiple entities, create separate stages instead.
 */
export function initializeLayoutFromEntities(entityIds) {
  if (!entityIds || entityIds.length === 0) {
    return createTile(null)
  }

  // With single entity per tile, just use the first entity
  // Additional entities should go in separate stages
  return createTile(entityIds[0])
}

/**
 * Get all entity IDs from a layout tree
 */
export function getAllEntityIds(layout) {
  if (!layout) return []

  if (layout.type === 'tile') {
    // New single entityId format
    if (layout.entityId) {
      return [layout.entityId]
    }
    // Backwards compat for legacy entityIds array
    if (layout.entityIds) {
      return [...layout.entityIds]
    }
    return []
  }

  if (layout.type === 'split') {
    return layout.children.flatMap(child => getAllEntityIds(child))
  }

  return []
}
