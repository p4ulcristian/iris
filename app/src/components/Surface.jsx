import { useMemo, useCallback } from 'react'
import Tile from './Tile'
import Resizer from './Resizer'
import { useWebSocket } from '../hooks/useWebSocket'
import { WS_URL } from '../config'

/**
 * Surface - Recursively renders a layout tree
 *
 * Layout nodes are either:
 * - TileNode: { type: 'tile', id, entityIds: string[], focusedEntityId: string | null }
 * - SplitNode: { type: 'split', id, direction: 'horizontal' | 'vertical', ratio: number, children: [LayoutNode, LayoutNode] }
 */
export default function Surface({
  node,
  tabId,
  depth = 0,
  entities,
  focusedTile,
  focusedEntity,
  containerSize
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

  // Tile node - render the Tile component
  if (node.type === 'tile') {
    return (
      <Tile
        tileId={node.id}
        entityIds={node.entityIds}
        focusedEntityId={node.focusedEntityId}
        isFocused={focusedTile === node.id}
        entities={entities}
        tabId={tabId}
        containerSize={containerSize}
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
            containerSize={containerSize ? {
              width: isHorizontal ? containerSize.width * firstFlex : containerSize.width,
              height: isHorizontal ? containerSize.height : containerSize.height * firstFlex
            } : null}
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
            containerSize={containerSize ? {
              width: isHorizontal ? containerSize.width * secondFlex : containerSize.width,
              height: isHorizontal ? containerSize.height : containerSize.height * secondFlex
            } : null}
          />
        </div>
      </div>
    )
  }

  return null
}
