import { useState, useCallback, useRef, useEffect } from 'react'
import TileCard from './TileCard'
import { renderEntityView } from '../entities/views'
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview'
import { useWebSocket } from '../hooks/useWebSocket'
import { WS_URL } from '../config'
import { useStore } from '../store'

/**
 * Tile - A single tile in a surface layout containing ONE entity
 * (Stacking is now achieved via stages, not entity arrays in tiles)
 */
export default function Tile({
  tileId,
  entityId,  // Single entity ID (new format)
  entityIds,  // Legacy: array of entity IDs (backwards compat)
  focusedEntityId,  // Legacy: kept for backwards compat
  isFocused,
  isChapter = false,  // True when tile has a parent split (is part of a chapter)
  entities,
  tabId,
  globalFocusedEntity
}) {
  const { send, connected } = useWebSocket(WS_URL)
  const ref = useRef(null)
  const [dropState, setDropState] = useState({ isDraggedOver: false, closestEdge: null, isRearrange: false })
  const [isDragging, setIsDragging] = useState(false)

  // Alt key state from global store
  const isAltHeld = useStore(s => s.isAltHeld)
  const setAltHeld = useStore(s => s.setAltHeld)

  // Track Alt key state for tile rearrangement mode
  // Also toggle body class for CSS pointer-events control
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Alt') {
        setAltHeld(true)
        document.body.classList.add('alt-held')
      }
    }
    const handleKeyUp = (e) => {
      if (e.key === 'Alt') {
        setAltHeld(false)
        document.body.classList.remove('alt-held')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      setAltHeld(false)
      document.body.classList.remove('alt-held')
    }
  }, [setAltHeld])

  // Get the entity for this tile (single entity per tile)
  // Support both new entityId and legacy entityIds format
  const tileEntityId = entityId || (entityIds && entityIds[0]) || null
  const tileEntity = tileEntityId ? entities[tileEntityId] : null

  // Handle clicking on the tile to focus it (skip when Alt is held for dragging)
  const handleTileClick = useCallback(() => {
    if (!isFocused && !isAltHeld) {
      send({ event: 'tile:focus', tileId })
    }
  }, [send, tileId, isFocused, isAltHeld])

  // Setup drop target
  useEffect(() => {
    const el = ref.current
    if (!el) return

    return dropTargetForElements({
      element: el,
      getData: ({ input, element }) => {
        // Attach closest edge data for split detection
        const data = attachClosestEdge({ tileId }, {
          element,
          input,
          allowedEdges: ['top', 'bottom', 'left', 'right']
        })
        return data
      },
      onDragEnter: ({ self, source }) => {
        const edge = extractClosestEdge(self.data)
        const isRearrange = source.data.source === 'tile-rearrange'
        const isSelf = source.data.tileId === tileId
        setDropState({ isDraggedOver: !isSelf, closestEdge: edge, isRearrange })
      },
      onDrag: ({ self, source }) => {
        const edge = extractClosestEdge(self.data)
        const isRearrange = source.data.source === 'tile-rearrange'
        const isSelf = source.data.tileId === tileId
        setDropState({ isDraggedOver: !isSelf, closestEdge: edge, isRearrange })
      },
      onDragLeave: () => {
        setDropState({ isDraggedOver: false, closestEdge: null, isRearrange: false })
      },
      onDrop: ({ source, self }) => {
        const edge = extractClosestEdge(self.data)
        const { source: dragSource, entityId: droppedEntityId, entityType, tileId: sourceTileId } = source.data

        // Determine zone from edge (null edge = center)
        const zone = edge || 'center'

        // With single entity per tile, center drop splits horizontally
        // (No more stacking - use stages for that)
        const direction = (zone === 'left' || zone === 'right' || zone === 'center')
          ? 'horizontal'
          : 'vertical'
        const position = zone === 'center' ? 'right' : zone

        if (dragSource === 'tile-rearrange') {
          // Alt+drag tile rearrangement - don't drop on self
          if (sourceTileId !== tileId) {
            send({
              event: 'layout:rearrange',
              tabId,
              sourceTileId,
              targetTileId: tileId,
              direction,
              position,
              entityId: droppedEntityId
            })
          }
        } else if (dragSource === 'spawn') {
          send({ event: 'layout:split', tabId, tileId, direction, position, entityType })
        } else if (dragSource === 'move') {
          send({ event: 'layout:split', tabId, tileId, direction, position, entityId: droppedEntityId })
        }

        setDropState({ isDraggedOver: false, closestEdge: null, isRearrange: false })
      }
    })
  }, [tileId, tabId, send])

  // Setup tile as draggable when Alt is held (for rearranging layout)
  useEffect(() => {
    const el = ref.current
    if (!el || !tileEntity) return

    return draggable({
      element: el,
      canDrag: () => isAltHeld,
      getInitialData: () => ({
        source: 'tile-rearrange',
        tileId,
        entityId: tileEntityId,
        entityType: tileEntity?.type
      }),
      onGenerateDragPreview: ({ nativeSetDragImage }) => {
        // Create a custom drag preview
        setCustomNativeDragPreview({
          nativeSetDragImage,
          render: ({ container }) => {
            const preview = document.createElement('div')
            preview.style.cssText = `
              padding: 8px 16px;
              background: rgba(0, 0, 0, 0.8);
              border: 2px solid var(--color-accent, #6366f1);
              border-radius: 8px;
              color: white;
              font-size: 14px;
              font-weight: 500;
              white-space: nowrap;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            `
            preview.textContent = `Moving: ${tileEntity?.name || tileEntity?.type || 'Tile'}`
            container.appendChild(preview)
          }
        })
      },
      onDragStart: () => {
        setIsDragging(true)
      },
      onDrop: () => {
        setIsDragging(false)
      }
    })
  }, [tileId, tileEntityId, tileEntity, isAltHeld])


  // Render entity content based on type (using centralized views registry)
  const renderEntityContent = (entity) => {
    const isEntityFocused = entity.id === globalFocusedEntity

    const view = renderEntityView(entity, {
      isFocused: isEntityFocused,
      send,
      connected
    })

    if (view) return view

    // Fallback for unknown entity types
    return (
      <div className="h-full flex items-center justify-center text-text-secondary">
        Unknown entity type: {entity.type}
      </div>
    )
  }

  // Get edge indicator styles
  const getEdgeIndicatorStyle = () => {
    if (!dropState.isDraggedOver) return {}

    const edge = dropState.closestEdge
    const isRearrange = dropState.isRearrange
    const baseStyle = isRearrange
      ? 'absolute bg-orange-500/40 transition-all duration-150'
      : 'absolute bg-accent/40 transition-all duration-150'

    const labelPrefix = isRearrange ? 'Move' : 'Split'

    switch (edge) {
      case 'top':
        return { className: `${baseStyle} top-0 left-0 right-0 h-1/4`, label: `${labelPrefix} above` }
      case 'bottom':
        return { className: `${baseStyle} bottom-0 left-0 right-0 h-1/4`, label: `${labelPrefix} below` }
      case 'left':
        return { className: `${baseStyle} top-0 bottom-0 left-0 w-1/4`, label: `${labelPrefix} left` }
      case 'right':
        return { className: `${baseStyle} top-0 bottom-0 right-0 w-1/4`, label: `${labelPrefix} right` }
      default:
        // Center = split/move right (no more stacking)
        return { className: `${baseStyle} top-0 bottom-0 right-0 w-1/2`, label: `${labelPrefix} right` }
    }
  }

  const edgeIndicator = getEdgeIndicatorStyle()

  // Build tile classes
  const tileClasses = [
    'relative h-full w-full overflow-hidden',
    isChapter ? 'border-2 border-white/20 rounded-2xl' : '',
    isDragging ? 'opacity-50 ring-2 ring-accent ring-offset-2 ring-offset-transparent' : '',
    isAltHeld && tileEntity ? 'cursor-grab' : ''
  ].filter(Boolean).join(' ')

  return (
    <div
      ref={ref}
      className={tileClasses}
      onMouseEnter={handleTileClick}
    >
      {/* Empty tile state */}
      {!tileEntity && (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-text-secondary liquid-glass-god rounded-2xl">
          <p className="text-base">Empty tile</p>
          <p className="text-sm opacity-70">Drop an entity here</p>
        </div>
      )}

      {/* Entity display - single entity per tile */}
      {tileEntity && (
        <TileCard
          entity={tileEntity}
          isFocused={isFocused}
          onClick={() => {}}
        >
          {renderEntityContent(tileEntity)}
        </TileCard>
      )}

      {/* Drop indicator overlay */}
      {dropState.isDraggedOver && (
        <div className="absolute inset-0 pointer-events-none z-50">
          <div className={edgeIndicator.className} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="px-3 py-1.5 bg-accent/80 text-white text-sm font-medium rounded-full shadow-lg">
              {edgeIndicator.label}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
