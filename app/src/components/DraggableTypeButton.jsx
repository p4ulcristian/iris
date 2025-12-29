import { useRef, useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus } from '@fortawesome/free-solid-svg-icons'
import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'

/**
 * DraggableTypeButton - A button that can be dragged to spawn entities
 */
export default function DraggableTypeButton({
  entityType,
  icon,
  iconComponent,
  title,
  onClick
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

  return (
    <button
      ref={ref}
      onClick={onClick}
      className={`
        group relative btn btn-glass btn-icon btn-icon-md
        cursor-grab active:cursor-grabbing
        ${isDragging ? 'opacity-50' : ''}
      `}
      style={{ touchAction: 'none' }}
      title={title}
    >
      {/* Icon (normal state) */}
      <span className="group-hover:opacity-0 transition-opacity duration-150">
        {iconComponent || (
          <FontAwesomeIcon icon={icon} className="text-sm" />
        )}
      </span>

      {/* Plus icon (hover state) */}
      <FontAwesomeIcon
        icon={faPlus}
        className="absolute text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-150"
      />
    </button>
  )
}
