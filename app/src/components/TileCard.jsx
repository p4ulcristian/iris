import { forwardRef } from 'react'

// Convert hex to RGB for CSS (comma-separated)
function hexToRgbCss(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return '128, 128, 128'
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
}

// Default colors for non-god entity types
const ENTITY_TYPE_COLORS = {
  god: null,        // Uses pantheon color
  terminal: '#888888',
  browser: '#4285F4',
  linear: '#5E6AD2',
  git: '#F05032',
  nvim: '#57A143',
  settings: '#6B7280',
  history: '#8B5CF6',
  cemetery: '#1F2937',
}

const TileCard = forwardRef(function TileCard({
  entity,
  isFocused,
  onClick,
  onDoubleClick,
  className = '',
  children
}, ref) {
  const { type, color } = entity

  // Use entity color if set, otherwise fall back to type default
  const entityColor = color || ENTITY_TYPE_COLORS[type] || '#888888'

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
export { ENTITY_TYPE_COLORS, hexToRgbCss }
