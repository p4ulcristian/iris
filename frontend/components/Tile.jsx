import { useState, useCallback, useRef, useEffect } from 'react'
import TileCard from './TileCard'
import DropIndicator from './DropIndicator'
import { renderEntityView } from './EntityRenderer'
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
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

  // Calculate which half the cursor is in based on position relative to element center
  const calculateHalf = (input, element) => {
    const rect = element.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const deltaX = input.clientX - centerX
    const deltaY = input.clientY - centerY

    // Compare absolute distances to determine axis
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      // More horizontal - show left or right half
      return deltaX < 0 ? 'left' : 'right'
    } else {
      // More vertical - show top or bottom half
      return deltaY < 0 ? 'top' : 'bottom'
    }
  }

  // Setup drop target
  useEffect(() => {
    const el = ref.current
    if (!el) return

    return dropTargetForElements({
      element: el,
      getData: ({ input, element }) => {
        // Calculate half and attach to data
        const half = calculateHalf(input, element)
        return { tileId, half }
      },
      onDragEnter: ({ self, source, location }) => {
        const half = calculateHalf(location.current.input, ref.current)
        const isRearrange = source.data.source === 'tile-rearrange'
        const isSelf = source.data.tileId === tileId
        setDropState({ isDraggedOver: !isSelf, closestEdge: half, isRearrange })
      },
      onDrag: ({ self, source, location }) => {
        const half = calculateHalf(location.current.input, ref.current)
        const isRearrange = source.data.source === 'tile-rearrange'
        const isSelf = source.data.tileId === tileId
        setDropState({ isDraggedOver: !isSelf, closestEdge: half, isRearrange })
      },
      onDragLeave: () => {
        setDropState({ isDraggedOver: false, closestEdge: null, isRearrange: false })
      },
      onDrop: ({ source, self, location }) => {
        const half = calculateHalf(location.current.input, ref.current)
        const { source: dragSource, entityId: droppedEntityId, entityType, tileId: sourceTileId } = source.data

        // Determine direction from half
        const direction = (half === 'left' || half === 'right')
          ? 'horizontal'
          : 'vertical'
        const position = half

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

  // Generate label for drop indicator
  const getDropLabel = () => {
    const prefix = dropState.isRearrange ? 'Move' : 'Split'
    const direction = {
      top: 'above',
      bottom: 'below',
      left: 'left',
      right: 'right'
    }[dropState.closestEdge] || 'right'
    return `${prefix} ${direction}`
  }

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

      {/* Spawning entity placeholder */}
      {tileEntity && tileEntity.readyState === 'spawning' && (
        <TileCard
          entity={tileEntity}
          isFocused={isFocused}
          onClick={() => {}}
        >
          <div className="h-full flex flex-col items-center justify-center gap-4 spawning-pulse">
            <div
              className="w-16 h-16 rounded-full opacity-60"
              style={{
                background: `radial-gradient(circle, ${tileEntity.color || '#888'}44 0%, transparent 70%)`,
                animation: 'spawning-glow 2s ease-in-out infinite'
              }}
            />
            <div className="text-center">
              <p className="text-lg font-medium text-white/90">Summoning {tileEntity.name}...</p>
              {tileEntity.mission && (
                <p className="text-sm text-white/50 mt-1 max-w-xs">{tileEntity.mission}</p>
              )}
            </div>
          </div>
        </TileCard>
      )}

      {/* Failed entity placeholder */}
      {tileEntity && tileEntity.readyState === 'failed' && (
        <TileCard
          entity={tileEntity}
          isFocused={isFocused}
          onClick={() => {}}
        >
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 rounded-full opacity-60 flex items-center justify-center text-red-400 text-3xl">
              ✕
            </div>
            <div className="text-center">
              <p className="text-lg font-medium text-red-400">Failed to summon {tileEntity.name}</p>
              {tileEntity.status && (
                <p className="text-sm text-white/50 mt-1">{tileEntity.status}</p>
              )}
            </div>
          </div>
        </TileCard>
      )}

      {/* Entity display - single entity per tile */}
      {tileEntity && tileEntity.readyState !== 'spawning' && tileEntity.readyState !== 'failed' && (
        <TileCard
          entity={tileEntity}
          isFocused={isFocused}
          onClick={() => {}}
        >
          {renderEntityContent(tileEntity)}
        </TileCard>
      )}

      {/* Drop indicator overlay */}
      <DropIndicator
        variant="half"
        position={dropState.closestEdge}
        label={getDropLabel()}
        visible={dropState.isDraggedOver}
      />
    </div>
  )
}
