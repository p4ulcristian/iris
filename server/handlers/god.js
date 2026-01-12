/**
 * God lifecycle and management handlers.
 */

import { PANTHEON } from '../config.js'
import {
  appState, saveState, broadcastState,
  getNextOrder, normalizeTabOrder,
  generateGodId, getGodDisplayName, getBaseGodName
} from '../state.js'
import { createGodSession, createTerminalSession, killGodSession, listGodSockets } from '../gods.js'
import { killPty, getOutputBuffer, clearOutputBuffer } from '../pty.js'
import { listSessions } from '../history.js'
import * as projects from '../projects.js'
import {
  createEntityBase,
  addEntity,
  createStageForEntity,
  splitIntoTile,
  finalizeSpawn,
  removeEntity,
  moveToTab,
  moveToNewTab,
  addToCemetery,
  getRandomRealmName
} from '../../entities/_shared/index.js'

// Helper to place entity based on mode
function placeEntity(entityId, tabId, mode, direction) {
  if (mode === 'stage') {
    createStageForEntity(entityId, tabId)
  } else {
    splitIntoTile(entityId, tabId, { direction })
  }
}

export const handlers = {
  'god:spawn': (ws, data, projectRoot) => {
    const spawnStart = Date.now()
    const T = () => `T+${Date.now() - spawnStart}ms`
    console.log(`[god:spawn] ${T()} Received:`, data)

    // Spawn mode: 'split' (default) or 'stage'
    const mode = data.mode || 'split'
    const direction = data.direction || 'horizontal'

    // If no name provided, pick from unused gods first, then random if all taken
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

    // Generate unique entity ID (zeus, zeus-2, zeus-3, etc.)
    const entityId = generateGodId(baseName)
    const displayName = getGodDisplayName(entityId)
    console.log(`[god:spawn] ${T()} Base: ${baseName}, EntityID: ${entityId}, Display: ${displayName}`)

    // Determine working directory - use selected project path if provided
    let workingDir = projectRoot
    if (data.project) {
      const projectConfig = projects.loadProject(data.project)
      if (projectConfig?.path) {
        workingDir = projectConfig.path.replace(/^~/, process.env.HOME || '')
      }
    }

    // STEP 1: Add entity immediately with 'spawning' state
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

    // Place entity based on mode (split by default, or new stage)
    placeEntity(entityId, appState.activeTabId, mode, direction)
    appState.focusedEntity = entityId
    saveState()
    console.log(`[god:spawn] ${T()} Added spawning entity, broadcasting...`)
    broadcastState()

    // STEP 2: Create the zellij session
    clearOutputBuffer(entityId)
    console.log(`[god:spawn] ${T()} Calling createGodSession`)
    let god
    try {
      god = createGodSession(entityId, data.task, workingDir, {
        startPrompt: appState.settings?.startPrompt,
        userName: appState.settings?.userName,
        personality: data.personality,
        permissionMode: data.permissionMode
      })
    } catch (err) {
      console.error(`[god:spawn] ${T()} createGodSession threw:`, err)
    }
    console.log(`[god:spawn] ${T()} createGodSession returned:`, god ? 'success' : 'null')

    // STEP 3: Update state based on result
    if (!god) {
      console.error('[god:spawn] FAILED - createGodSession returned null')
      appState.entities[entityId].readyState = 'failed'
      appState.entities[entityId].status = 'Session failed to start'
      saveState()
      broadcastState()
      return
    }

    // Success - update to working state
    appState.entities[entityId].readyState = 'working'
    appState.entities[entityId].sessionId = god.sessionId || null
    saveState()
    console.log('[god:spawn] SUCCESS - broadcasting final state')
    broadcastState()
  },

  'terminal:spawn': (ws, data, projectRoot) => {
    // Spawn mode: 'split' (default) or 'stage'
    const mode = data.mode || 'split'
    const direction = data.direction || 'horizontal'

    if (data.name) {
      clearOutputBuffer(data.name)
    }
    const terminal = createTerminalSession({
      command: data.command,
      name: data.name,
      color: data.color,
      cwd: data.cwd
    }, projectRoot)

    if (terminal && !terminal.exists) {
      const entity = createEntityBase(terminal.name, 'terminal', {
        name: terminal.displayName || terminal.name,
        extra: { color: terminal.color }
      })
      addEntity(terminal.name, entity)
      placeEntity(terminal.name, appState.activeTabId, mode, direction)
      finalizeSpawn(terminal.name)
    } else if (terminal?.exists) {
      ws.send(JSON.stringify({ event: 'god:spawned', ...terminal }))
    }
  },

  'god:kill': (ws, data) => {
    handlers['entity:kill'](ws, data)
  },

  'entity:kill': (ws, data) => {
    const entityId = data.entityId || data.godName || data.name
    const entity = appState.entities[entityId]

    // Add god to cemetery before banishing
    if (entity?.type === 'god') {
      addToCemetery(entity)
    }

    // For god/terminal types, clean up PTY
    if (entity?.type === 'god' || entity?.type === 'terminal') {
      killPty(entityId)
      killGodSession(entityId)
      clearOutputBuffer(entityId)
    }

    // Remove entity (handles layout, focus, cleanup)
    removeEntity(entityId)
    saveState()
    broadcastState()
  },

  'god:list': (ws) => {
    const gods = listGodSockets()
    ws.send(JSON.stringify({ event: 'god:list', gods }))
  },

  'god:set-title': (ws, data) => {
    handlers['entity:set-title'](ws, data)
  },

  'entity:set-title': (ws, data) => {
    const entityId = data.entityId || data.godName
    const title = data.title
    if (entityId && appState.entities[entityId]) {
      appState.entities[entityId].title = title
      saveState()
      broadcastState()
    }
  },

  'god:set-status': (ws, data) => {
    handlers['entity:set-status'](ws, data)
  },

  'entity:set-status': (ws, data) => {
    const entityId = data.entityId || data.godName
    const status = data.status
    if (entityId && appState.entities[entityId]) {
      appState.entities[entityId].status = status
      saveState()
      broadcastState()
    }
  },

  'god:set-ready': (ws, data) => {
    handlers['entity:set-ready'](ws, data)
  },

  'entity:set-ready': (ws, data) => {
    const entityId = data.entityId || data.godName
    const readyState = data.readyState
    if (entityId && appState.entities[entityId]) {
      appState.entities[entityId].readyState = readyState
      saveState()
      broadcastState()
    }
  },

  'god:peek': (ws, data) => {
    handlers['entity:peek'](ws, data)
  },

  'entity:peek': (ws, data) => {
    const entityId = data.entityId || data.godName
    const lines = data.lines || 50
    const output = getOutputBuffer(entityId, lines)
    ws.send(JSON.stringify({
      event: 'entity:peek:response',
      entityId,
      output,
      lines: output.split('\n').length
    }))
  },

  'god:move': (ws, data) => {
    handlers['entity:move'](ws, data)
  },

  'entity:move': (ws, data) => {
    const entityId = data.entityId || data.godName
    if (!appState.entities[entityId]) return
    moveToTab(entityId, data.tabId)
  },

  'god:move-to-new-tab': (ws, data) => {
    handlers['entity:move-to-new-tab'](ws, data)
  },

  'entity:move-to-new-tab': (ws, data) => {
    const entityId = data.entityId || data.godName
    if (!appState.entities[entityId]) return
    moveToNewTab(entityId, getRandomRealmName)
  },

  // History management
  'history:list': (ws, data, projectRoot) => {
    listSessions(projectRoot, data.limit || 20, data.offset || 0).then(sessions => {
      ws.send(JSON.stringify({ event: 'history:list', sessions }))
    }).catch(err => {
      console.error('Failed to list sessions:', err)
      ws.send(JSON.stringify({ event: 'history:list', sessions: [], error: err.message }))
    })
  },

  'history:resume': (ws, data, projectRoot) => {
    const god = createGodSession(data.name, '', projectRoot, { resumeSessionId: data.sessionId })
    if (god && !god.exists) {
      const entity = createEntityBase(god.name, 'god', {
        name: god.name,
        extra: { mission: data.summary || null, project: projectRoot }
      })
      addEntity(god.name, entity)
      createStageForEntity(god.name)
      finalizeSpawn(god.name)
    } else if (god?.exists) {
      ws.send(JSON.stringify({ event: 'god:spawned', ...god }))
    }
  },

  // Cemetery management
  'cemetery:resurrect': (ws, data, projectRoot) => {
    const { godId, sessionId, name, mission, title } = data
    if (!sessionId) return

    const godName = godId || name
    if (!godName) return

    // If there's an existing entity with this name, clean it up first
    const existingEntity = appState.entities[godName]
    if (existingEntity) {
      if (existingEntity.type === 'god') {
        addToCemetery(existingEntity)
      }
      killPty(godName)
      clearOutputBuffer(godName)
      removeEntity(godName)
    }

    // Resume the session with the god's name
    const god = createGodSession(godName, '', projectRoot, { resumeSessionId: sessionId })
    if (god && !god.exists) {
      const entity = createEntityBase(god.name, 'god', {
        name: god.name,
        extra: {
          mission: mission || null,
          title: title || null,
          sessionId: sessionId,
          project: projectRoot
        }
      })
      addEntity(god.name, entity)
      createStageForEntity(god.name)

      appState.cemetery = appState.cemetery.filter(f => f.sessionId !== sessionId)
      finalizeSpawn(god.name)
    } else if (god?.exists) {
      ws.send(JSON.stringify({ event: 'god:spawned', ...god }))
    }
  },

  'cemetery:remove': (ws, data) => {
    const { sessionId } = data
    if (!sessionId) return
    appState.cemetery = appState.cemetery.filter(f => f.sessionId !== sessionId)
    saveState()
    broadcastState()
  },

  'cemetery:clear': () => {
    appState.cemetery = []
    saveState()
    broadcastState()
  },
}
