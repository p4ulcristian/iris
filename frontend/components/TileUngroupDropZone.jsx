import { useState, useRef, useEffect } from 'react'
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { useWebSocket } from '../hooks/useWebSocket'
import { WS_URL } from '../config'

/**
 * Drop zone for ungrouping tiles (dropping them back to the sidebar)
 * When a tile is Alt+dragged here, it creates its own stage (ungroups from current layout)
 */
export default function TileUngroupDropZone({ children, className = '' }) {
  const { send } = useWebSocket(WS_URL)
  const ref = useRef(null)
  const [isOver, setIsOver] = useState(false)
  const [draggedName, setDraggedName] = useState(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => {
        // Only accept tile-rearrange drops
        return source.data.source === 'tile-rearrange'
      },
      onDragEnter: ({ source }) => {
        setIsOver(true)
        setDraggedName(source.data.entityType || 'tile')
      },
      onDrag: () => {
        setIsOver(true)
      },
      onDragLeave: () => {
        setIsOver(false)
        setDraggedName(null)
      },
      onDrop: ({ source }) => {
        const { entityId } = source.data

        // Ungroup: split entity into its own stage
        if (entityId) {
          send({ event: 'stage:split', entityId })
        }

        setIsOver(false)
        setDraggedName(null)
      }
    })
  }, [send])

  return (
    <div ref={ref} className={`relative ${className}`}>
      {children}

      {/* Drop overlay when dragging a tile over */}
      {isOver && (
        <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center">
          <div className="absolute inset-0 bg-orange-500/20 border-2 border-dashed border-orange-500 rounded-xl" />
          <div className="relative px-4 py-2 bg-orange-500/90 text-white text-sm font-medium rounded-lg shadow-lg">
            Ungroup {draggedName}
          </div>
        </div>
      )}
    </div>
  )
}
