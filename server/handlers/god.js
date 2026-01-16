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
  getGod,
  interruptGod
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
    const t0 = performance.now()
    log.log(`god:spawn START`)
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
    if (data.project) {
      const projectConfig = projects.loadProject(data.project)
      if (projectConfig?.path) {
        workingDir = projectConfig.path.replace(/^~/, process.env.HOME || '')
      }
    }

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
    log.log(`god:spawn placeEntity done +${(performance.now() - t0).toFixed(1)}ms`)
    saveState()
    log.log(`god:spawn saveState done +${(performance.now() - t0).toFixed(1)}ms`)
    broadcastState()  // Tile appears immediately
    log.log(`god:spawn broadcast done +${(performance.now() - t0).toFixed(1)}ms`)

    // Create god process async so tile renders first
    const task = data.task
    const personality = data.personality
    const permissionMode = data.permissionMode

    setImmediate(() => {
      log.log(`Creating god with task="${task}"`)
      try {
        // CRITICAL: Attach client BEFORE creating god to receive all messages
        // createGod will create the entry if it doesn't exist yet
        const result = createGod(entityId, {
          task,
          project: workingDir,
          personality,
          permissionMode
        })

        // Now attach the client - the entry exists
        attachClient(entityId, ws)

        // Update sessionId if returned (readyState transitions in gods.js on init)
        if (result.sessionId) {
          appState.entities[entityId].sessionId = result.sessionId
          saveState()
        }

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
    const { godName } = data
    if (!godName) return

    let entry = attachClient(godName, ws)

    // If no process but entity exists, respawn it with session resumption
    if (!entry && appState.entities[godName]?.type === 'god') {
      const entity = appState.entities[godName]
      console.log(`[GOD] Auto-respawning ${godName} (sessionId: ${entity.sessionId || 'none'}, project: ${entity.project})`)

      createGod(godName, {
        project: entity.project,
        sessionId: entity.sessionId,
      })

      // Try attach again
      entry = attachClient(godName, ws)
      console.log(`[GOD] After respawn, attachClient result: ${entry ? `found with ${entry.history?.length} history items` : 'NOT FOUND'}`)

      // Update readyState after successful reconnection
      if (entry && appState.entities[godName]) {
        appState.entities[godName].readyState = 'working'
        saveState()
        broadcastState()
      }
    }

    if (!entry) {
      ws.send(JSON.stringify({
        event: 'god:state',
        godName,
        history: [],
        streaming: false,
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

  /**
   * Interrupt a running god (like Ctrl+C).
   */
  'god:interrupt': (ws, data) => {
    const { godName } = data
    if (godName) {
      interruptGod(godName)
    }
  },
}
