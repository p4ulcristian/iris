import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { forwardRef } from 'react'

/**
 * Button - Unified button component with liquid glass aesthetic
 *
 * @param {string} variant - 'glass' (default), 'solid', or 'ghost'
 * @param {string} size - 'sm', 'md' (default), or 'lg'
 * @param {string} color - 'accent', 'danger', 'success', or hex color (god colors)
 * @param {object} icon - FontAwesome icon object
 * @param {string} iconPosition - 'left' (default) or 'right'
 * @param {boolean} disabled - Disable the button
 * @param {boolean} loading - Show loading state (disables button)
 * @param {string} className - Additional CSS classes
 */
const Button = forwardRef(({
  variant = 'glass',
  size = 'md',
  color,
  icon,
  iconPosition = 'left',
  disabled = false,
  loading = false,
  className = '',
  children,
  style = {},
  ...props
}, ref) => {
  const isGodColor = color && color.startsWith('#')

  // Named color classes
  const colorClass = color === 'danger' ? 'btn-danger'
    : color === 'success' ? 'btn-success'
    : ''

  // God color inline styles (dynamic hex colors)
  const godColorStyle = isGodColor ? {
    background: `${color}20`,
    borderColor: `${color}40`,
    color: color,
    ...style
  } : style

  // Hover style for god colors (applied via CSS custom property)
  const hoverStyle = isGodColor ? {
    '--btn-hover-bg': `${color}30`,
    ...godColorStyle
  } : godColorStyle

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`btn btn-${variant} btn-${size} ${colorClass} ${className}`}
      style={hoverStyle}
      {...props}
    >
      {icon && iconPosition === 'left' && (
        <FontAwesomeIcon icon={icon} />
      )}
      {children}
      {icon && iconPosition === 'right' && (
        <FontAwesomeIcon icon={icon} />
      )}
    </button>
  )
})

Button.displayName = 'Button'

export default Button
