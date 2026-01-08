import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

const VARIANTS = {
  accent: 'bg-accent/20 text-accent border-accent/30 hover:bg-accent/30',
  success: 'bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30',
  danger: 'bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30',
  warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30',
  ghost: 'bg-transparent text-text-secondary border-white/10 hover:bg-white/10 hover:text-text-primary'
}

/**
 * Action button with color variants.
 * @param {Object} props
 * @param {React.ReactNode} props.children - Button text
 * @param {'accent' | 'success' | 'danger' | 'warning' | 'ghost'} [props.variant] - Color variant
 * @param {import('@fortawesome/fontawesome-svg-core').IconDefinition} [props.icon] - Optional icon
 * @param {Function} props.onClick - Click handler
 * @param {boolean} [props.disabled] - Disabled state
 * @param {boolean} [props.compact] - Smaller size
 * @param {string} [props.className] - Additional classes
 */
export default function ActionButton({
  children,
  variant = 'accent',
  icon,
  onClick,
  disabled = false,
  compact = false,
  className = ''
}) {
  const variantClasses = VARIANTS[variant] || VARIANTS.accent

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        flex items-center gap-2 border rounded-lg
        transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        ${compact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'}
        ${variantClasses}
        ${className}
      `}
    >
      {icon && <FontAwesomeIcon icon={icon} className={compact ? 'w-3 h-3' : 'w-4 h-4'} />}
      {children}
    </button>
  )
}
