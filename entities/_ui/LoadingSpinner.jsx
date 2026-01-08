import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSpinner } from '@fortawesome/free-solid-svg-icons'

/**
 * Loading spinner.
 * @param {Object} props
 * @param {'sm' | 'md' | 'lg'} [props.size] - Spinner size
 * @param {string} [props.className] - Additional classes
 */
export default function LoadingSpinner({ size = 'md', className = '' }) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  }

  return (
    <FontAwesomeIcon
      icon={faSpinner}
      className={`animate-spin text-text-secondary ${sizeClasses[size]} ${className}`}
    />
  )
}

/**
 * Full container loading state.
 * @param {Object} props
 * @param {string} [props.message] - Loading message
 */
export function LoadingState({ message = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-text-secondary">
      <LoadingSpinner size="lg" />
      <span className="text-sm">{message}</span>
    </div>
  )
}
