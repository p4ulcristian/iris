import { useRef, useEffect, useState } from 'react'
import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { useStore } from '../store'
import EntityIcon from './EntityIcon'

/**
 * DraggableTypeButton - A button that can be dragged to spawn entities
 */
export default function DraggableTypeButton({
  entityType,
  iconComponent, // Optional override - prefer using entityType for icon
  title,
  onClick,
  size = 'medium', // 'medium' | 'large'
  showLabel = false
}) {
  const ref = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const entityRegistry = useStore(s => s.entityRegistry)
  const entityConfig = entityRegistry[entityType]

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

  if (showLabel) {
    return (
      <button
        ref={ref}
        onClick={onClick}
        className={`
          w-full h-full flex flex-col items-center justify-center gap-1 p-2 rounded-lg
          btn-glass cursor-grab active:cursor-grabbing
          hover:bg-white/10 transition-all
          ${isDragging ? 'opacity-50' : ''}
        `}
        style={{ touchAction: 'none' }}
        title={title}
      >
        <EntityIcon type={entityType} size="large" />
        <span className="text-[10px] text-white/60 truncate w-full text-center">{entityConfig?.label || entityType}</span>
      </button>
    )
  }

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
