/**
 * PTY and service management handlers.
 */

import { SERVICES } from '../config.js'
import { appState, saveState, broadcastState } from '../state.js'
import { startService, stopService, startChronicle, stopChronicle } from '../services.js'

export const handlers = {
  'service:start': (ws, data, projectRoot) => {
    const service = data.service
    if (service === 'chronicle') {
      startChronicle()
    } else if (service && SERVICES[service]) {
      startService(service, projectRoot)
    }
  },

  'service:stop': (ws, data) => {
    const service = data.service
    if (service === 'chronicle') {
      stopChronicle()
    } else if (service && SERVICES[service]) {
      stopService(service)
    }
  },

  // PTY management - handled by frontend xterm.js now
  'pty:attach': (ws, data) => {
    // No-op - terminal attaches directly via Zellij
  },

  'pty:detach': (ws, data) => {
    // No-op
  },

  'pty:input': (ws, data) => {
    const godName = data.entityId || data.godName
    const entity = appState.entities[godName] ||
      Object.values(appState.entities).find(e => e.name === godName)

    // Reset readyState when user types to an entity
    if (entity?.readyState && entity.readyState !== 'working') {
      entity.readyState = 'working'
      saveState()
      broadcastState()
    }
  },

  'pty:resize': (ws, data) => {
    // No-op - resize handled by frontend
  },
}
