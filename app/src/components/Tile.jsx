import { useState, useCallback, useRef, useEffect } from 'react'
import TileCard from './TileCard'
import TerminalContent from './TerminalContent'
import BrowserView from './BrowserView'
import HistoryView from './HistoryView'
import GitView from './GitView'
import LinearView from './LinearView'
import SettingsView from './SettingsView'
import CemeteryView from './CemeteryView'
import CalendarView from './CalendarView'
import CodeView from './CodeView'
import OracleView from './OracleView'
import YouTubeMusicView from './YouTubeMusicView'
import MessengerView from './MessengerView'
import DiscordView from './DiscordView'
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'
import { useWebSocket } from '../hooks/useWebSocket'
import { WS_URL } from '../config'

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
  const [dropState, setDropState] = useState({ isDraggedOver: false, closestEdge: null })

  // Get the entity for this tile (single entity per tile)
  // Support both new entityId and legacy entityIds format
  const tileEntityId = entityId || (entityIds && entityIds[0]) || null
  const tileEntity = tileEntityId ? entities[tileEntityId] : null

  // Handle clicking on the tile to focus it
  const handleTileClick = useCallback(() => {
    if (!isFocused) {
      send({ event: 'tile:focus', tileId })
    }
  }, [send, tileId, isFocused])

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
      onDragEnter: ({ self }) => {
        const edge = extractClosestEdge(self.data)
        setDropState({ isDraggedOver: true, closestEdge: edge })
      },
      onDrag: ({ self }) => {
        const edge = extractClosestEdge(self.data)
        setDropState({ isDraggedOver: true, closestEdge: edge })
      },
      onDragLeave: () => {
        setDropState({ isDraggedOver: false, closestEdge: null })
      },
      onDrop: ({ source, self }) => {
        const edge = extractClosestEdge(self.data)
        const { source: dragSource, entityId: droppedEntityId, entityType } = source.data

        // Determine zone from edge (null edge = center)
        const zone = edge || 'center'

        // With single entity per tile, center drop splits horizontally
        // (No more stacking - use stages for that)
        const direction = (zone === 'left' || zone === 'right' || zone === 'center')
          ? 'horizontal'
          : 'vertical'
        const position = zone === 'center' ? 'right' : zone

        if (dragSource === 'spawn') {
          send({ event: 'layout:split', tabId, tileId, direction, position, entityType })
        } else if (dragSource === 'move') {
          send({ event: 'layout:split', tabId, tileId, direction, position, entityId: droppedEntityId })
        }

        setDropState({ isDraggedOver: false, closestEdge: null })
      }
    })
  }, [tileId, tabId, send])


  // Render entity content based on type
  const renderEntityContent = (entity) => {
    const isEntityFocused = entity.id === globalFocusedEntity

    switch (entity.type) {
      case 'god':
      case 'terminal':
        return (
          <TerminalContent
            entity={entity}
            isFocused={isEntityFocused}
          />
        )
      case 'browser':
        return <BrowserView entityId={entity.id} />
      case 'history':
        return <HistoryView send={send} />
      case 'git':
        return <GitView send={send} />
      case 'linear':
        return <LinearView send={send} connected={connected} />
      case 'settings':
        return <SettingsView send={send} />
      case 'cemetery':
        return <CemeteryView send={send} />
      case 'calendar':
        return <CalendarView send={send} />
      case 'code':
        return <CodeView entityId={entity.id} />
      case 'oracle':
        return <OracleView entityId={entity.id} />
      case 'youtube-music':
        return <YouTubeMusicView />
      case 'messenger':
        return <MessengerView />
      case 'discord':
        return <DiscordView />
      default:
        return (
          <div className="h-full flex items-center justify-center text-text-secondary">
            Unknown entity type: {entity.type}
          </div>
        )
    }
  }

  // Get edge indicator styles
  const getEdgeIndicatorStyle = () => {
    if (!dropState.isDraggedOver) return {}

    const edge = dropState.closestEdge
    const baseStyle = 'absolute bg-accent/40 transition-all duration-150'

    switch (edge) {
      case 'top':
        return { className: `${baseStyle} top-0 left-0 right-0 h-1/4`, label: 'Split above' }
      case 'bottom':
        return { className: `${baseStyle} bottom-0 left-0 right-0 h-1/4`, label: 'Split below' }
      case 'left':
        return { className: `${baseStyle} top-0 bottom-0 left-0 w-1/4`, label: 'Split left' }
      case 'right':
        return { className: `${baseStyle} top-0 bottom-0 right-0 w-1/4`, label: 'Split right' }
      default:
        // Center = split right (no more stacking)
        return { className: `${baseStyle} top-0 bottom-0 right-0 w-1/2`, label: 'Split right' }
    }
  }

  const edgeIndicator = getEdgeIndicatorStyle()

  return (
    <div
      ref={ref}
      className={`relative h-full w-full overflow-hidden ${isChapter ? 'border-2 border-white/20 rounded-2xl' : ''}`}
      onClick={handleTileClick}
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
