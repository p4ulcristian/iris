import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

/**
 * Icon button with hover effect.
 * @param {Object} props
 * @param {import('@fortawesome/fontawesome-svg-core').IconDefinition} props.icon - FontAwesome icon
 * @param {Function} props.onClick - Click handler
 * @param {boolean} [props.disabled] - Disabled state
 * @param {boolean} [props.spinning] - Show spinning animation
 * @param {string} [props.title] - Tooltip text
 * @param {string} [props.className] - Additional classes
 */
export default function IconButton({
  icon,
  onClick,
  disabled = false,
  spinning = false,
  title,
  className = ''
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        p-2 rounded-lg transition-colors
        hover:bg-white/10
        disabled:opacity-30 disabled:cursor-not-allowed
        ${className}
      `}
    >
      <FontAwesomeIcon
        icon={icon}
        className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`}
      />
    </button>
  )
}
