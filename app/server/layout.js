/**
 * Layout Tree Helpers
 *
 * Layout nodes are either:
 * - PaneNode: { type: 'pane', id, entityIds: string[], focusedEntityId: string | null }
 * - SplitNode: { type: 'split', id, direction: 'horizontal' | 'vertical', ratio: number, children: [LayoutNode, LayoutNode] }
 */

import { generatePaneId, generateSplitId } from './state.js'

/**
 * Create a new pane node
 */
export function createPane(entityIds = [], focusedEntityId = null) {
  return {
    type: 'pane',
    id: generatePaneId(),
    entityIds,
    focusedEntityId: focusedEntityId || entityIds[0] || null
  }
}

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
 * Find a pane by ID
 */
export function findPane(layout, paneId) {
  const result = findNode(layout, paneId)
  if (result && result.node.type === 'pane') {
    return result
  }
  return null
}

/**
 * Find the pane containing a specific entity
 */
export function findPaneByEntity(layout, entityId) {
  if (!layout) return null

  if (layout.type === 'pane') {
    if (layout.entityIds.includes(entityId)) {
      return layout
    }
    return null
  }

  if (layout.type === 'split') {
    for (const child of layout.children) {
      const result = findPaneByEntity(child, entityId)
      if (result) return result
    }
  }

  return null
}

/**
 * Get all panes in the layout tree
 */
export function getAllPanes(layout) {
  if (!layout) return []

  if (layout.type === 'pane') {
    return [layout]
  }

  if (layout.type === 'split') {
    return layout.children.flatMap(child => getAllPanes(child))
  }

  return []
}

/**
 * Get the first pane in the layout tree
 */
export function getFirstPane(layout) {
  if (!layout) return null

  if (layout.type === 'pane') {
    return layout
  }

  if (layout.type === 'split') {
    return getFirstPane(layout.children[0])
  }

  return null
}

/**
 * Split a pane in a given direction and position
 * position: 'before' | 'after' | 'left' | 'right' | 'top' | 'bottom'
 * Returns a new layout tree (immutable)
 */
export function splitPane(layout, paneId, direction, position, newEntityId) {
  if (!layout) return layout

  // Normalize position to 'before' or 'after'
  const normalizedPosition = normalizePosition(position, direction)

  // Deep clone to avoid mutation
  const cloned = JSON.parse(JSON.stringify(layout))

  const result = findPane(cloned, paneId)
  if (!result) return cloned

  const { node: pane, parent, index } = result

  // Create new pane for the dropped entity
  const newPane = createPane(newEntityId ? [newEntityId] : [], newEntityId)

  // Create split node with old pane and new pane
  const children = normalizedPosition === 'before'
    ? [newPane, pane]
    : [pane, newPane]

  const splitNode = createSplit(direction, children, 0.5)

  // Replace pane with split node
  if (parent) {
    parent.children[index] = splitNode
  } else {
    // Pane was root node
    return splitNode
  }

  return cloned
}

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
 * Add an entity to a pane's stack
 * Returns a new layout tree (immutable)
 */
export function addEntityToPane(layout, paneId, entityId) {
  if (!layout) return layout

  const cloned = JSON.parse(JSON.stringify(layout))
  const result = findPane(cloned, paneId)

  if (!result) return cloned

  const { node: pane } = result

  // Don't add if already present
  if (!pane.entityIds.includes(entityId)) {
    pane.entityIds.push(entityId)
  }

  // Focus the new entity
  pane.focusedEntityId = entityId

  return cloned
}

/**
 * Remove an entity from any pane in the layout
 * If the pane becomes empty, it's automatically collapsed (sibling takes over)
 * Returns a new layout tree (immutable) - never contains empty panes
 */
export function removeEntityFromLayout(layout, entityId) {
  if (!layout) return layout

  // Recursive removal that collapses empty panes atomically
  function removeAndCollapse(node, parent, childIndex) {
    if (node.type === 'pane') {
      if (!node.entityIds.includes(entityId)) {
        return node // Entity not here, keep as-is
      }

      // Remove the entity
      const newEntityIds = node.entityIds.filter(id => id !== entityId)

      if (newEntityIds.length > 0) {
        // Pane still has entities - return updated pane
        return {
          ...node,
          entityIds: newEntityIds,
          focusedEntityId: node.focusedEntityId === entityId
            ? newEntityIds[0]
            : node.focusedEntityId
        }
      } else {
        // Pane is now empty - return null to signal collapse
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
 * Move an entity from one pane to another
 * Returns a new layout tree (immutable)
 */
export function moveEntityToPane(layout, entityId, targetPaneId) {
  if (!layout) return layout

  // First remove from current location
  let cloned = removeEntityFromLayout(layout, entityId)

  // Then add to target pane
  cloned = addEntityToPane(cloned, targetPaneId, entityId)

  return cloned
}

/**
 * Merge a pane into its sibling (collapse the split)
 * Returns { layout, mergedEntityIds } (immutable)
 */
export function mergePane(layout, paneId) {
  if (!layout) return { layout, mergedEntityIds: [] }

  const cloned = JSON.parse(JSON.stringify(layout))
  const result = findNode(cloned, paneId)

  if (!result || !result.parent) {
    // Can't merge root node
    return { layout: cloned, mergedEntityIds: [] }
  }

  const { parent: splitNode, index } = result
  const paneToMerge = result.node
  const siblingIndex = index === 0 ? 1 : 0
  const sibling = splitNode.children[siblingIndex]

  // Get entities from the pane being merged
  const mergedEntityIds = paneToMerge.type === 'pane' ? [...paneToMerge.entityIds] : []

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
 * Set the focused entity in a pane
 * Returns a new layout tree (immutable)
 */
export function setFocusedEntityInPane(layout, paneId, entityId) {
  if (!layout) return layout

  const cloned = JSON.parse(JSON.stringify(layout))
  const result = findPane(cloned, paneId)

  if (!result) return cloned

  const { node: pane } = result

  // Only set if entity is in this pane
  if (pane.entityIds.includes(entityId)) {
    pane.focusedEntityId = entityId
  }

  return cloned
}

/**
 * Initialize layout from flat entity list (migration helper)
 */
export function initializeLayoutFromEntities(entityIds) {
  if (!entityIds || entityIds.length === 0) {
    return createPane([])
  }

  return createPane(entityIds, entityIds[0])
}

/**
 * Get all entity IDs from a layout tree
 */
export function getAllEntityIds(layout) {
  if (!layout) return []

  if (layout.type === 'pane') {
    return [...layout.entityIds]
  }

  if (layout.type === 'split') {
    return layout.children.flatMap(child => getAllEntityIds(child))
  }

  return []
}
