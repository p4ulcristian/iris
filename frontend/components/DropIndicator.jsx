/**
 * DropIndicator - Unified drop indicator for all drag-and-drop operations
 *
 * Variants:
 * - "half" - covers half the container (top/bottom/left/right)
 * - "edge" - thin line at edge (for list reordering)
 * - "full" - covers entire container (for empty zones)
 */
export default function DropIndicator({
  variant = 'half',
  position = 'right',
  label,
  visible = false
}) {
  if (!visible) return null

  // Base styles shared by all variants
  const baseOverlay = 'absolute pointer-events-none z-50 transition-all duration-150'
  const labelBadge = 'px-3 py-1.5 bg-accent/90 text-white text-sm font-medium rounded-full shadow-lg'

  // Half variant - covers 50% of container
  if (variant === 'half') {
    const positionStyles = {
      top: 'top-0 left-0 right-0 h-1/2',
      bottom: 'bottom-0 left-0 right-0 h-1/2',
      left: 'top-0 bottom-0 left-0 w-1/2',
      right: 'top-0 bottom-0 right-0 w-1/2'
    }

    return (
      <div className={`${baseOverlay} inset-0`}>
        <div className={`absolute bg-accent/30 ${positionStyles[position] || positionStyles.right}`} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={labelBadge}>{label}</span>
        </div>
      </div>
    )
  }

  // Edge variant - thin line for list reordering
  if (variant === 'edge') {
    const isTop = position === 'top'

    return (
      <div
        className={`
          ${baseOverlay}
          left-0 right-0 h-1
          ${isTop ? '-top-0.5' : '-bottom-0.5'}
          flex items-center justify-center
        `}
      >
        <div className={`absolute inset-x-0 h-full bg-accent rounded-full`} />
        {label && (
          <span className={`${labelBadge} relative z-10 text-xs py-1`}>{label}</span>
        )}
      </div>
    )
  }

  // Full variant - covers entire container
  if (variant === 'full') {
    return (
      <div className={`${baseOverlay} inset-4 border-2 border-dashed border-accent/60 rounded-2xl bg-accent/10 flex items-center justify-center`}>
        <span className={labelBadge}>{label}</span>
      </div>
    )
  }

  return null
}
