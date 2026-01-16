/**
 * WebSocket handlers for God entities.
 */

import { PANTHEON } from '../config.js'
import {
  appState, saveState, broadcastState,
  getNextOrder, generateGodId, getGodDisplayName, getBaseGodName
} from '../state.js'
import {
  createGod,
  sendUserMessage,
  attachClient,
  detachClient,
  killGod,
  listGods,
  getGod
} from '../gods.js'
import {
  createEntityBase,
  addEntity,
  createStageForEntity,
  splitIntoTile,
  finalizeSpawn,
  removeEntity
} from '../../entities/_shared/index.js'
import * as projects from '../projects.js'
import { createLogger } from '../logger.js'

const log = createLogger('god-handler')

// Helper to place entity based on mode
function placeEntity(entityId, tabId, mode, direction) {
  if (mode === 'stage') {
    createStageForEntity(entityId, tabId)
  } else {
    splitIntoTile(entityId, tabId, { direction })
  }
}

export const handlers = {
  /**
   * Spawn a new god.
   */
  'god:spawn': (ws, data, projectRoot) => {
    console.log('[GOD-HANDLER] god:spawn received:', JSON.stringify(data))
    const mode = data.mode || 'split'
    const direction = data.direction || 'horizontal'

    // Pick god name from pantheon if not specified
    let baseName = data.name?.toLowerCase()
    if (!baseName) {
      const pantheonNames = Object.keys(PANTHEON)
      const usedBaseNames = new Set(
        Object.keys(appState.entities)
          .filter(id => appState.entities[id].type === 'god')
          .map(id => getBaseGodName(id))
      )
      const available = pantheonNames.filter(n => !usedBaseNames.has(n))
      baseName = available.length > 0
        ? available[Math.floor(Math.random() * available.length)]
        : pantheonNames[Math.floor(Math.random() * pantheonNames.length)]
    }

    // Generate unique entity ID
    const entityId = generateGodId(baseName)
    const displayName = getGodDisplayName(entityId)

    // Determine working directory
    let workingDir = projectRoot
    log.log(`data.project=${data.project}, projectRoot=${projectRoot}`)
    if (data.project) {
      const projectConfig = projects.loadProject(data.project)
      log.log(`projectConfig=${JSON.stringify(projectConfig)}`)
      if (projectConfig?.path) {
        workingDir = projectConfig.path.replace(/^~/, process.env.HOME || '')
      }
    }
    log.log(`Final workingDir=${workingDir}`)

    // Add entity with 'spawning' state
    appState.entities[entityId] = {
      id: entityId,
      type: 'god',
      name: displayName,
      tabId: appState.activeTabId,
      order: getNextOrder(appState.activeTabId),
      mission: data.task || null,
      spawnedAt: Date.now(),
      sessionId: null,
      project: workingDir,
      readyState: 'spawning'
    }

    // Place entity
    placeEntity(entityId, appState.activeTabId, mode, direction)
    appState.focusedEntity = entityId
    saveState()
    broadcastState()  // Tile appears immediately

    // Create god process async so tile renders first
    const task = data.task
    const personality = data.personality
    const permissionMode = data.permissionMode

    setImmediate(() => {
      log.log(`Creating god with task="${task}"`)
      try {
        const result = createGod(entityId, {
          task,
          project: workingDir,
          personality,
          permissionMode
        })

        // Update state
        appState.entities[entityId].readyState = 'working'
        appState.entities[entityId].sessionId = result.sessionId || null
        saveState()
        broadcastState()

        // Auto-attach this WebSocket
        attachClient(entityId, ws)

      } catch (err) {
        appState.entities[entityId].readyState = 'failed'
        appState.entities[entityId].status = 'Failed to start: ' + err.message
        saveState()
        broadcastState()
      }
    })
  },

  /**
   * Send a user message to a god.
   */
  'god:send': (ws, data) => {
    console.log('[GOD-HANDLER] god:send received:', JSON.stringify(data))
    const { godName, text } = data
    if (!godName || !text) return

    const success = sendUserMessage(godName, text)
    if (!success) {
      ws.send(JSON.stringify({
        event: 'god:error',
        godName,
        error: 'Failed to send message'
      }))
    }
  },

  /**
   * Attach to a god (subscribe to updates).
   * Auto-respawns if entity exists but process died (e.g., after restart).
   */
  'god:attach': (ws, data) => {
    console.log('[GOD-HANDLER] god:attach received:', JSON.stringify(data))
    const { godName } = data
    if (!godName) return

    let entry = attachClient(godName, ws)
    console.log('[GOD-HANDLER] attachClient result:', entry ? 'found' : 'not found')

    // If no process but entity exists, respawn it with session resumption
    if (!entry && appState.entities[godName]?.type === 'god') {
      const entity = appState.entities[godName]
      console.log(`[GOD] Auto-respawning ${godName} (sessionId: ${entity.sessionId || 'none'})`)

      createGod(godName, {
        project: entity.project,
        sessionId: entity.sessionId, // Resume existing session if available
        // Don't re-send task on respawn - session has history
      })

      // Try attach again
      entry = attachClient(godName, ws)
    }

    if (!entry) {
      ws.send(JSON.stringify({
        event: 'god:error',
        godName,
        error: 'God not found'
      }))
    }
  },

  /**
   * Detach from a god.
   */
  'god:detach': (ws, data) => {
    const { godName } = data
    if (godName) {
      detachClient(godName, ws)
    }
  },

  /**
   * Kill a god.
   */
  'god:kill': (ws, data) => {
    const entityId = data.entityId || data.godName
    if (!entityId) return

    killGod(entityId)
    removeEntity(entityId)
    saveState()
    broadcastState()
  },

  /**
   * List active gods.
   */
  'god:list': (ws) => {
    const gods = listGods()
    ws.send(JSON.stringify({ event: 'god:list', gods }))
  },
}
