import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'

const DragContext = createContext(null)

export function DragProvider({ children }) {
  const [dragData, setDragData] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dropTarget, setDropTarget] = useState(null) // { paneId, zone }

  // Monitor all drag events globally
  useEffect(() => {
    return monitorForElements({
      onDragStart: ({ source }) => {
        setDragData(source.data)
        setIsDragging(true)
      },
      onDrag: ({ location }) => {
        // Could track position here if needed
      },
      onDrop: () => {
        setDragData(null)
        setIsDragging(false)
        setDropTarget(null)
      },
      onDropTargetChange: ({ location }) => {
        // Track which drop target is being hovered
        const target = location.current.dropTargets[0]
        if (target) {
          setDropTarget({
            paneId: target.data.paneId,
            zone: target.data.zone
          })
        } else {
          setDropTarget(null)
        }
      }
    })
  }, [])

  const updateDropTarget = useCallback((target) => {
    setDropTarget(target)
  }, [])

  return (
    <DragContext.Provider value={{
      dragData,
      isDragging,
      dropTarget,
      updateDropTarget
    }}>
      {children}
    </DragContext.Provider>
  )
}

export function useDrag() {
  const context = useContext(DragContext)
  if (!context) {
    throw new Error('useDrag must be used within a DragProvider')
  }
  return context
}

export default DragContext
