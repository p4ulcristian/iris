/**
 * Browser Entity Server Handlers
 *
 * Handles server-side events for browser entities.
 */

export const type = 'browser'

/**
 * Called when a browser entity is spawned
 * @param {object} data - Spawn data from client
 * @param {object} context - Server context (appState, ws, etc.)
 * @returns {object} - Initial entity data
 */
export function onSpawn(data, context) {
  return {
    url: data.url || 'https://google.com'
  }
}

/**
 * Called when an entity-specific event is received
 * @param {string} event - Event name (e.g., 'browser:navigate')
 * @param {object} data - Event data
 * @param {object} context - Server context
 */
export function onEvent(event, data, context) {
  switch (event) {
    case 'browser:navigate':
      // Navigation is handled by the generic handler in handlers.js
      // This is here as an example of how to handle entity-specific events
      break
  }
}

/**
 * Called when a browser entity is destroyed
 * @param {string} entityId - The entity being destroyed
 * @param {object} context - Server context
 */
export function onDestroy(entityId, context) {
  // Browser entities don't need cleanup, but this is where you'd do it
}
