import { forwardRef } from 'react'
import { useStore } from '../store'
import { getEntityColor } from '../entities'

// Convert hex to RGB for CSS (comma-separated)
function hexToRgbCss(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return '128, 128, 128'
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
}

const TileCard = forwardRef(function TileCard({
  entity,
  isFocused,
  onClick,
  onDoubleClick,
  className = '',
  children
}, ref) {
  const { type, name, color } = entity
  const godColors = useStore(s => s.godColors)

  // Use god color for gods, entity color for others, fall back to type default
  const entityColor = type === 'god'
    ? (godColors[name?.toLowerCase()] || color || '#888')
    : (color || getEntityColor(type))

  const focusClass = isFocused ? 'tile-focused' : 'tile-unfocused'

  return (
    <div
      ref={ref}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={`relative h-full min-h-0 overflow-hidden rounded-xl liquid-glass-god-tinted ${focusClass} ${className}`}
      style={{
        '--god-color': entityColor,
        '--god-color-rgb': hexToRgbCss(entityColor),
      }}
    >
      {children}
    </div>
  )
})

export default TileCard
export { hexToRgbCss }
