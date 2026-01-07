/**
 * Handler router - dispatches WebSocket messages to handler modules.
 *
 * This replaces the monolithic switch statement in the old handlers.js
 */

import { broadcast } from '../state.js'
import { handlers as godHandlers } from './god.js'
import { handlers as entityHandlers } from './entity.js'
import { handlers as ptyHandlers } from './pty.js'
import { handlers as tabHandlers } from './tab.js'
import { handlers as fileHandlers } from './file.js'
import { handlers as gitHandlers } from './git.js'
import { handlers as linearHandlers } from './linear.js'
import { handlers as calendarHandlers } from './calendar.js'
import { handlers as settingsHandlers } from './settings.js'
import { handlers as layoutHandlers } from './layout.js'
import { handlers as configHandlers } from './config.js'

// Merge all handlers into a single lookup table
const allHandlers = {
  ...godHandlers,
  ...entityHandlers,
  ...ptyHandlers,
  ...tabHandlers,
  ...fileHandlers,
  ...gitHandlers,
  ...linearHandlers,
  ...calendarHandlers,
  ...settingsHandlers,
  ...layoutHandlers,
  ...configHandlers,
}

/**
 * Handle an incoming WebSocket message.
 *
 * @param {WebSocket} ws - The WebSocket connection
 * @param {object} msg - The parsed message object
 * @param {string} projectRoot - The project root directory
 */
export function handleMessage(ws, msg, projectRoot) {
  const { event, ...data } = msg

  // Debug: log file:read requests
  if (event === 'file:read') {
    console.log('[handleMessage] file:read received, id:', data.id, 'path:', data.path)
  }

  const handler = allHandlers[event]
  if (handler) {
    try {
      handler(ws, data, projectRoot)
    } catch (err) {
      console.error(`[${event}] Handler error:`, err)
      ws.send(JSON.stringify({ event: 'error', message: err.message }))
    }
  } else {
    // Forward unknown events to all clients (like original default case)
    broadcast(event, data)
  }
}

// Export for debugging
export { allHandlers }
