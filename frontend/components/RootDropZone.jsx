import { useRef, useEffect, useState } from 'react'
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { useWebSocket } from '../hooks/useWebSocket'
import { WS_URL } from '../config'
import DropIndicator from './DropIndicator'

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
      <DropIndicator
        variant="full"
        label="Create first tile"
        visible={isDraggedOver && !hasLayout}
      />
    </div>
  )
}
