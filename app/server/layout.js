/**
 * Surface Layout Tree Helpers
 *
 * Layout nodes are either:
 * - TileNode: { type: 'tile', id, entityIds: string[], focusedEntityId: string | null }
 * - SplitNode: { type: 'split', id, direction: 'horizontal' | 'vertical', ratio: number, children: [LayoutNode, LayoutNode] }
 */

import { generateTileId, generateSplitId } from './state.js'

/**
 * Create a new tile node
 */
export function createTile(entityIds = [], focusedEntityId = null) {
  return {
    type: 'tile',
    id: generateTileId(),
    entityIds,
    focusedEntityId: focusedEntityId || entityIds[0] || null
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
    if (layout.entityIds.includes(entityId)) {
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

  // Create new tile for the dropped entity
  const newTile = createTile(newEntityId ? [newEntityId] : [], newEntityId)

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
 * Add an entity to a tile's stack
 * Returns a new layout tree (immutable)
 */
export function addEntityToTile(layout, tileId, entityId) {
  if (!layout) return layout

  const cloned = JSON.parse(JSON.stringify(layout))
  const result = findTile(cloned, tileId)

  if (!result) return cloned

  const { node: tile } = result

  // Don't add if already present
  if (!tile.entityIds.includes(entityId)) {
    tile.entityIds.push(entityId)
  }

  // Focus the new entity
  tile.focusedEntityId = entityId

  return cloned
}

// Alias for backwards compatibility
export const addEntityToPane = addEntityToTile

/**
 * Remove an entity from any tile in the layout
 * If the tile becomes empty, it's automatically collapsed (sibling takes over)
 * Returns a new layout tree (immutable) - never contains empty tiles
 */
export function removeEntityFromLayout(layout, entityId) {
  if (!layout) return layout

  // Recursive removal that collapses empty tiles atomically
  function removeAndCollapse(node, parent, childIndex) {
    if (node.type === 'tile') {
      if (!node.entityIds.includes(entityId)) {
        return node // Entity not here, keep as-is
      }

      // Remove the entity
      const newEntityIds = node.entityIds.filter(id => id !== entityId)

      if (newEntityIds.length > 0) {
        // Tile still has entities - return updated tile
        return {
          ...node,
          entityIds: newEntityIds,
          focusedEntityId: node.focusedEntityId === entityId
            ? newEntityIds[0]
            : node.focusedEntityId
        }
      } else {
        // Tile is now empty - return null to signal collapse
        return null
      }
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
  const mergedEntityIds = tileToMerge.type === 'tile' ? [...tileToMerge.entityIds] : []

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
 * Returns a new layout tree (immutable)
 */
export function setFocusedEntityInTile(layout, tileId, entityId) {
  if (!layout) return layout

  const cloned = JSON.parse(JSON.stringify(layout))
  const result = findTile(cloned, tileId)

  if (!result) return cloned

  const { node: tile } = result

  // Only set if entity is in this tile
  if (tile.entityIds.includes(entityId)) {
    tile.focusedEntityId = entityId
  }

  return cloned
}

// Alias for backwards compatibility
export const setFocusedEntityInPane = setFocusedEntityInTile

/**
 * Initialize layout from flat entity list (migration helper)
 */
export function initializeLayoutFromEntities(entityIds) {
  if (!entityIds || entityIds.length === 0) {
    return createTile([])
  }

  return createTile(entityIds, entityIds[0])
}

/**
 * Get all entity IDs from a layout tree
 */
export function getAllEntityIds(layout) {
  if (!layout) return []

  if (layout.type === 'tile') {
    return [...layout.entityIds]
  }

  if (layout.type === 'split') {
    return layout.children.flatMap(child => getAllEntityIds(child))
  }

  return []
}
