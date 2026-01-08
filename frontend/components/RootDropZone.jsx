import { useRef, useEffect, useState } from 'react'
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { useWebSocket } from '../hooks/useWebSocket'
import { WS_URL } from '../config'

/**
 * RootDropZone - Handles drops when there's no layout (first entity in a tab)
 * or when dropping on the edges of the entire content area
 */
export default function RootDropZone({ children, tabId, hasLayout }) {
  const { send } = useWebSocket(WS_URL)
  const ref = useRef(null)
  const [isDraggedOver, setIsDraggedOver] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    return dropTargetForElements({
      element: el,
      // Only accept drops if there's no layout yet
      canDrop: () => !hasLayout,
      getData: () => ({ isRoot: true }),
      onDragEnter: () => setIsDraggedOver(true),
      onDragLeave: () => setIsDraggedOver(false),
      onDrop: ({ source }) => {
        const { source: dragSource, entityId, entityType } = source.data

        // Create the first tile with this entity
        if (dragSource === 'spawn') {
          send({ event: 'layout:init', tabId, entityType })
        } else if (dragSource === 'move') {
          send({ event: 'layout:init', tabId, entityId })
        }

        setIsDraggedOver(false)
      }
    })
  }, [tabId, hasLayout, send])

  return (
    <div ref={ref} className="relative h-full w-full">
      {children}

      {/* Drop indicator for empty state */}
      {isDraggedOver && !hasLayout && (
        <div className="absolute inset-0 pointer-events-none z-50 flex items-center justify-center">
          <div className="absolute inset-4 border-2 border-dashed border-accent/60 rounded-2xl bg-accent/10" />
          <span className="px-4 py-2 bg-accent/80 text-white text-sm font-medium rounded-full shadow-lg z-10">
            Drop to create first tile
          </span>
        </div>
      )}
    </div>
  )
}
