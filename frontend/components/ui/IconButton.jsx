import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { forwardRef } from 'react'

/**
 * IconButton - Square icon-only button with 12px border-radius
 *
 * @param {object} icon - FontAwesome icon object (required)
 * @param {string} size - 'sm' (24px), 'md' (32px), or 'lg' (40px)
 * @param {string} variant - 'glass' (default) or 'ghost'
 * @param {string} color - 'accent', 'danger', 'success', or hex color (god colors)
 * @param {string} title - Tooltip text
 * @param {boolean} disabled - Disable the button
 * @param {string} className - Additional CSS classes
 */
const IconButton = forwardRef(({
  icon,
  size = 'md',
  variant = 'glass',
  color,
  title,
  disabled = false,
  className = '',
  style = {},
  ...props
}, ref) => {
  const isGodColor = color && color.startsWith('#')

  // Named color classes
  const colorClass = color === 'danger' ? 'btn-danger'
    : color === 'success' ? 'btn-success'
    : ''

  // God color inline styles
  const godColorStyle = isGodColor ? {
    background: `${color}20`,
    borderColor: `${color}40`,
    color: color,
    '--btn-hover-bg': `${color}30`,
    ...style
  } : style

  // Icon size based on button size
  const iconSize = size === 'sm' ? 'xs' : size === 'lg' ? 'sm' : 'xs'

  return (
    <button
      ref={ref}
      disabled={disabled}
      title={title}
      className={`btn btn-${variant} btn-icon btn-icon-${size} ${colorClass} ${className}`}
      style={godColorStyle}
      {...props}
    >
      <FontAwesomeIcon icon={icon} size={iconSize} />
    </button>
  )
})

IconButton.displayName = 'IconButton'

export default IconButton
