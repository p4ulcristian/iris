import { useMemo, useCallback } from 'react'
import Tile from './Tile'
import Resizer from './Resizer'
import { useWebSocket } from '../hooks/useWebSocket'
import { WS_URL } from '../config'

/**
 * Find a tile by ID in the layout tree
 */
function findTileInLayout(node, tileId) {
  if (!node) return null
  if (node.type === 'tile' && node.id === tileId) return node
  if (node.type === 'split') {
    for (const child of node.children) {
      const found = findTileInLayout(child, tileId)
      if (found) return found
    }
  }
  return null
}

/**
 * Surface - Recursively renders a layout tree
 *
 * Layout nodes are either:
 * - TileNode: { type: 'tile', id, entityId: string | null }
 * - SplitNode: { type: 'split', id, direction: 'horizontal' | 'vertical', ratio: number, children: [LayoutNode, LayoutNode] }
 *
 * Each tile holds exactly ONE entity. Stacking is achieved via stages.
 */
export default function Surface({
  node,
  tabId,
  depth = 0,
  entities,
  focusedTile,
  focusedEntity,
  maximizedTile
}) {
  const { send } = useWebSocket(WS_URL)

  // Handle resize
  const handleResize = useCallback((splitId, ratio) => {
    send({ event: 'layout:resize', tabId, splitId, ratio })
  }, [send, tabId])

  // If no node, show empty state
  if (!node) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-text-secondary">
        <p className="text-base">No entities</p>
        <p className="text-sm opacity-70">
          Press <kbd className="px-1.5 py-0.5 bg-bg-tertiary border border-border rounded text-xs font-mono">Ctrl+N</kbd> to add
        </p>
      </div>
    )
  }

  // Maximized mode: render only the maximized tile at full size
  if (maximizedTile && depth === 0) {
    const maxTile = findTileInLayout(node, maximizedTile)
    if (maxTile) {
      return (
        <Tile
          tileId={maxTile.id}
          entityId={maxTile.entityId}
          entityIds={maxTile.entityIds}
          focusedEntityId={maxTile.focusedEntityId}
          isFocused={true}
          isChapter={false}
          isMaximized={true}
          entities={entities}
          tabId={tabId}
          globalFocusedEntity={focusedEntity}
        />
      )
    }
  }

  // Tile node - render the Tile component
  if (node.type === 'tile') {
    return (
      <Tile
        tileId={node.id}
        entityId={node.entityId}
        entityIds={node.entityIds}  // Legacy support
        focusedEntityId={node.focusedEntityId}  // Legacy support
        isFocused={focusedTile === node.id}
        isChapter={depth > 0}  // Has parent split = is a chapter
        entities={entities}
        tabId={tabId}
        globalFocusedEntity={focusedEntity}
      />
    )
  }

  // Split node - render children with resizer
  if (node.type === 'split') {
    const { direction, ratio, children } = node
    const isHorizontal = direction === 'horizontal'

    // Calculate sizes based on ratio
    const firstFlex = ratio
    const secondFlex = 1 - ratio

    return (
      <div
        className={`flex h-full w-full ${isHorizontal ? 'flex-row' : 'flex-col'}`}
        style={{ minHeight: 0, minWidth: 0 }}
      >
        {/* First child */}
        <div
          style={{
            flex: firstFlex,
            minHeight: 0,
            minWidth: 0,
            overflow: 'hidden'
          }}
        >
          <Surface
            node={children[0]}
            tabId={tabId}
            depth={depth + 1}
            entities={entities}
            focusedTile={focusedTile}
            focusedEntity={focusedEntity}
            maximizedTile={maximizedTile}
          />
        </div>

        {/* Resizer */}
        <Resizer
          direction={direction}
          splitId={node.id}
          ratio={ratio}
          onResize={(newRatio) => handleResize(node.id, newRatio)}
        />

        {/* Second child */}
        <div
          style={{
            flex: secondFlex,
            minHeight: 0,
            minWidth: 0,
            overflow: 'hidden'
          }}
        >
          <Surface
            node={children[1]}
            tabId={tabId}
            depth={depth + 1}
            entities={entities}
            focusedTile={focusedTile}
            focusedEntity={focusedEntity}
            maximizedTile={maximizedTile}
          />
        </div>
      </div>
    )
  }

  return null
}
