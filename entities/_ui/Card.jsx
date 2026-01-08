/**
 * Card container with consistent styling.
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {boolean} [props.hover] - Enable hover effect
 * @param {boolean} [props.compact] - Smaller padding
 * @param {string} [props.className] - Additional classes
 * @param {Function} [props.onClick] - Click handler
 */
export default function Card({
  children,
  hover = false,
  compact = false,
  className = '',
  onClick
}) {
  return (
    <div
      onClick={onClick}
      className={`
        bg-black/30 border border-white/10 rounded-xl
        ${hover ? 'hover:bg-black/40 hover:border-white/20 transition-all cursor-pointer' : ''}
        ${compact ? 'p-3' : 'p-4'}
        ${className}
      `}
    >
      {children}
    </div>
  )
}
