import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import EntityCard from './EntityCard'
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
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'
import { useWebSocket } from '../hooks/useWebSocket'
import { WS_URL } from '../config'

/**
 * Pane - A single pane in a split layout that contains a stack of entities
 */
export default function Pane({
  paneId,
  entityIds,
  focusedEntityId,
  isFocused,
  entities,
  tabId,
  containerSize,
  globalFocusedEntity
}) {
  const { send } = useWebSocket(WS_URL)
  const ref = useRef(null)
  const [dropState, setDropState] = useState({ isDraggedOver: false, closestEdge: null })

  // Get entity objects for this pane
  const paneEntities = useMemo(() => {
    return entityIds
      .map(id => entities[id])
      .filter(Boolean)
  }, [entityIds, entities])

  // The entity that should be shown in this pane
  const visibleEntityId = focusedEntityId || entityIds[0] || null
  const visibleEntity = visibleEntityId ? entities[visibleEntityId] : null

  // Handle clicking on the pane to focus it
  const handlePaneClick = useCallback(() => {
    if (!isFocused) {
      send({ event: 'pane:focus', paneId })
    }
  }, [send, paneId, isFocused])

  // Setup drop target
  useEffect(() => {
    const el = ref.current
    if (!el) return

    return dropTargetForElements({
      element: el,
      getData: ({ input, element }) => {
        // Attach closest edge data for split detection
        const data = attachClosestEdge({ paneId }, {
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
        const { source: dragSource, entityId, entityType } = source.data

        // Determine zone from edge (null edge = center)
        const zone = edge || 'center'

        if (zone === 'center') {
          // Add to this pane's stack
          if (dragSource === 'spawn') {
            send({ event: 'layout:add-entity-to-pane', paneId, entityType })
          } else if (dragSource === 'move') {
            send({ event: 'layout:add-entity-to-pane', paneId, entityId })
          }
        } else {
          // Split the pane
          const direction = (zone === 'left' || zone === 'right') ? 'horizontal' : 'vertical'

          if (dragSource === 'spawn') {
            send({ event: 'layout:split', tabId, paneId, direction, position: zone, entityType })
          } else if (dragSource === 'move') {
            send({ event: 'layout:split', tabId, paneId, direction, position: zone, entityId })
          }
        }

        setDropState({ isDraggedOver: false, closestEdge: null })
      }
    })
  }, [paneId, tabId, send])

  // Get stack position for animation
  const getStackPosition = (entityId, focusedId, entityList) => {
    const focusedIdx = entityList.findIndex(e => e.id === focusedId)
    const entityIdx = entityList.findIndex(e => e.id === entityId)
    return entityIdx - focusedIdx
  }

  const getStackStyle = (position) => {
    const y = `${position * 90}%`
    const rotateX = position * -15
    const absPos = Math.abs(position)

    return {
      y,
      rotateX,
      opacity: absPos === 0 ? 1 : 0,
      scale: 1 - absPos * 0.08,
      zIndex: 10 - absPos,
      pointerEvents: position === 0 ? 'auto' : 'none'
    }
  }

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
            expectedWidth={containerSize?.width || 800}
            expectedHeight={containerSize?.height || 600}
          />
        )
      case 'browser':
        return <BrowserView entityId={entity.id} />
      case 'history':
        return <HistoryView send={send} />
      case 'git':
        return <GitView send={send} />
      case 'linear':
        return <LinearView send={send} />
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
        return { className: `${baseStyle} inset-4`, label: 'Add to stack' }
    }
  }

  const edgeIndicator = getEdgeIndicatorStyle()

  return (
    <div
      ref={ref}
      className={`relative h-full w-full overflow-hidden ${isFocused ? 'ring-2 ring-accent/50' : ''}`}
      style={{ perspective: '1200px' }}
      onClick={handlePaneClick}
    >
      {/* Empty pane state */}
      {paneEntities.length === 0 && (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-text-secondary liquid-glass-god rounded-2xl">
          <p className="text-base">Empty pane</p>
          <p className="text-sm opacity-70">Drop an entity here</p>
        </div>
      )}

      {/* Entity stack */}
      {paneEntities.length > 0 && containerSize && (
        <AnimatePresence mode="popLayout">
          {paneEntities.map(entity => {
            const position = getStackPosition(entity.id, visibleEntityId, paneEntities)
            const style = getStackStyle(position)

            return (
              <motion.div
                key={entity.id}
                initial={{ opacity: 0, y: '-100%', scale: 0.9, rotateX: 15 }}
                animate={{
                  y: style.y,
                  rotateX: style.rotateX,
                  scale: style.scale,
                  opacity: style.opacity,
                  zIndex: style.zIndex,
                }}
                exit={{ opacity: 0, y: '100%', scale: 0.9, rotateX: -15 }}
                transition={{
                  type: 'spring',
                  stiffness: 250,
                  damping: 25,
                  opacity: { type: 'tween', duration: 0.25, ease: 'easeOut' },
                }}
                className="absolute inset-0"
                style={{
                  pointerEvents: style.pointerEvents,
                  transformOrigin: 'center center',
                }}
              >
                <EntityCard
                  entity={entity}
                  isFocused={position === 0 && isFocused}
                  onClick={() => {
                    if (position !== 0) {
                      send({ event: 'pane:focus-entity', paneId, entityId: entity.id })
                    }
                  }}
                >
                  {renderEntityContent(entity)}
                </EntityCard>
              </motion.div>
            )
          })}
        </AnimatePresence>
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
