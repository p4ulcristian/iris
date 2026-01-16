import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
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
 *
 * NOTE: Dynamic state (entities, focus, maximized) is read from store,
 * not passed as props. This prevents unnecessary re-renders during animations.
 */
export default function Tile({
  tileId,
  entityId,  // Single entity ID (new format)
  entityIds,  // Legacy: array of entity IDs (backwards compat)
  isChapter = false,  // True when tile has a parent split (is part of a chapter)
  tabId
}) {
  const { send, connected } = useWebSocket(WS_URL)
  const ref = useRef(null)  // Original tile position
  const portalRef = useRef(null)  // Portal element for maximized view
  const [dropState, setDropState] = useState({ isDraggedOver: false, closestEdge: null, isRearrange: false })
  const [isDragging, setIsDragging] = useState(false)

  // Read dynamic state from store
  const entities = useStore(s => s.entities)
  const focusedTile = useStore(s => s.focusedTile)
  const focusedEntity = useStore(s => s.focusedEntity)
  const maximizedTile = useStore(s => s.maximizedTile)

  // Derived state
  const isFocused = focusedTile === tileId
  const isMaximized = maximizedTile === tileId
  const globalFocusedEntity = focusedEntity

  // FLIP animation for maximize/restore
  const prevMaximizedRef = useRef(isMaximized)
  const firstRectRef = useRef(null)

  // Capture "First" position before render
  // When maximizing: capture from original tile
  // When restoring: capture from portal
  if (prevMaximizedRef.current !== isMaximized) {
    const sourceEl = prevMaximizedRef.current ? portalRef.current : ref.current
    if (sourceEl) {
      firstRectRef.current = sourceEl.getBoundingClientRect()
    }
  }

  // FLIP: animate after DOM update
  useLayoutEffect(() => {
    // Target element is the one we're animating TO
    const targetEl = isMaximized ? portalRef.current : ref.current
    if (!targetEl || !firstRectRef.current) {
      prevMaximizedRef.current = isMaximized
      return
    }

    if (prevMaximizedRef.current !== isMaximized) {
      const first = firstRectRef.current
      const last = targetEl.getBoundingClientRect()

      // Calculate the transform to go from "last" back to "first"
      const deltaX = first.left - last.left
      const deltaY = first.top - last.top
      const scaleX = first.width / last.width
      const scaleY = first.height / last.height

      // Apply inverted transform (no transition yet)
      targetEl.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`
      targetEl.style.transformOrigin = 'top left'

      // Force reflow
      targetEl.offsetHeight

      // Add transition and animate to final position
      targetEl.classList.add('tile-flip-animate')
      targetEl.style.transform = ''

      // Clean up after animation
      const cleanup = () => {
        targetEl.classList.remove('tile-flip-animate')
        targetEl.style.transformOrigin = ''
      }
      targetEl.addEventListener('transitionend', cleanup, { once: true })

      // Update ref
      prevMaximizedRef.current = isMaximized
      firstRectRef.current = null
    }
  }, [isMaximized])

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

  // Handle mouse entering tile - send hover for kill targeting, focus for visual state
  const handleMouseEnter = useCallback(() => {
    // Always send hover for accurate kill targeting (server tracks this)
    send({ event: 'tile:hover', entityId: tileEntityId })

    // Send focus event (existing behavior, skipped if already focused or Alt held)
    if (!isFocused && !isAltHeld) {
      send({ event: 'tile:focus', tileId })
    }
  }, [send, tileId, tileEntityId, isFocused, isAltHeld])

  // Handle mouse leaving tile - clear hover state
  const handleMouseLeave = useCallback(() => {
    send({ event: 'tile:hover', entityId: null })
  }, [send])

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

  // Build tile classes (for non-maximized state)
  const tileClasses = [
    'relative h-full w-full overflow-hidden',
    isChapter ? 'border-2 border-white/20 rounded-2xl' : '',
    isDragging ? 'opacity-50 ring-2 ring-accent ring-offset-2 ring-offset-transparent' : '',
    isAltHeld && tileEntity ? 'cursor-grab' : ''
  ].filter(Boolean).join(' ')

  // Render tile content (shared between normal and maximized views)
  const renderTileContent = () => {
    if (!tileEntity) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-text-secondary liquid-glass-god rounded-2xl">
          <p className="text-base">Empty tile</p>
          <p className="text-sm opacity-70">Drop an entity here</p>
        </div>
      )
    }

    if (tileEntity.readyState === 'spawning') {
      return (
        <TileCard entity={tileEntity} isFocused={isFocused} onClick={() => {}}>
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
      )
    }

    if (tileEntity.readyState === 'failed') {
      return (
        <TileCard entity={tileEntity} isFocused={isFocused} onClick={() => {}}>
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
      )
    }

    return (
      <TileCard entity={tileEntity} isFocused={isFocused} onClick={() => {}}>
        {renderEntityContent(tileEntity)}
      </TileCard>
    )
  }

  // When maximized, render content through portal to escape transformed containers
  if (isMaximized) {
    return (
      <>
        {/* Placeholder in original position (for layout and FLIP source) */}
        <div
          ref={ref}
          data-tile-id={tileId}
          className={tileClasses}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Empty placeholder - content is in portal */}
          <div className="h-full rounded-xl bg-white/5 border border-white/10" />
          <DropIndicator
            variant="half"
            position={dropState.closestEdge}
            label={getDropLabel()}
            visible={dropState.isDraggedOver}
          />
        </div>

        {/* Maximized content via portal (escapes transformed ancestors) */}
        {createPortal(
          <div
            ref={portalRef}
            className="tile-maximized-portal"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {renderTileContent()}
          </div>,
          document.body
        )}
      </>
    )
  }

  // Normal (non-maximized) render
  return (
    <div
      ref={ref}
      data-tile-id={tileId}
      className={tileClasses}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {renderTileContent()}
      <DropIndicator
        variant="half"
        position={dropState.closestEdge}
        label={getDropLabel()}
        visible={dropState.isDraggedOver}
      />
    </div>
  )
}
