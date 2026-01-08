import { useRef, useEffect, useState } from 'react'
import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { EntityIcon } from '../entities'

/**
 * DraggableTypeButton - A button that can be dragged to spawn entities
 */
export default function DraggableTypeButton({
  entityType,
  iconComponent, // Optional override - prefer using entityType for icon
  title,
  onClick,
  size = 'medium' // 'medium' | 'large'
}) {
  const ref = useRef(null)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Prevent any parent from capturing this drag
    const preventCapture = (e) => {
      e.stopPropagation()
    }
    el.addEventListener('pointerdown', preventCapture)

    const cleanup = draggable({
      element: el,
      getInitialData: () => ({
        source: 'spawn',
        entityType
      }),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false)
    })

    return () => {
      cleanup()
      el.removeEventListener('pointerdown', preventCapture)
    }
  }, [entityType])

  const sizeClass = size === 'large' ? 'btn-icon-lg' : 'btn-icon-md'

  return (
    <button
      ref={ref}
      onClick={onClick}
      className={`
        btn btn-glass btn-icon ${sizeClass}
        cursor-grab active:cursor-grabbing
        ${isDragging ? 'opacity-50' : ''}
      `}
      style={{ touchAction: 'none' }}
      title={title}
    >
      {iconComponent || <EntityIcon type={entityType} size={size} />}
    </button>
  )
}
