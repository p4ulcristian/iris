/**
 * Time formatting utilities.
 */

/**
 * Format a date/timestamp to time string (HH:MM).
 * @param {string | number | Date} input - Date string, timestamp, or Date object
 * @returns {string} Formatted time
 */
export function formatTime(input) {
  const date = new Date(input)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * Format a date/timestamp to date string.
 * @param {string | number | Date} input - Date string, timestamp, or Date object
 * @param {Object} [options] - Intl.DateTimeFormat options
 * @returns {string} Formatted date
 */
export function formatDate(input, options = { month: 'short', day: 'numeric' }) {
  const date = new Date(input)
  return date.toLocaleDateString(undefined, options)
}

/**
 * Format a timestamp as relative time (e.g., "5m ago", "2h ago").
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Relative time string
 */
export function formatTimeSince(timestamp) {
  const now = Date.now()
  const diffMs = now - timestamp
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  const date = new Date(timestamp)
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: diffDays > 365 ? 'numeric' : undefined
  })
}

/**
 * Format duration in milliseconds to MM:SS or HH:MM:SS.
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
export function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
