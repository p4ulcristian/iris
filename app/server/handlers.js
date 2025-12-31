import fs from 'fs'
import path from 'path'
import { SERVICES, REALMS, PANTHEON, LOGS_DIR, GOD_COLORS } from './config.js'
import { appState, saveState, broadcastState, broadcast, applySettingsToEnv, generateEntityId, getNextEntityNumber, normalizeTabOrder, getNextOrder, generateStageId, findStageByEntity, getActiveStage, deleteTabIfEmpty } from './state.js'
import { startService, stopService, startChronicle, stopChronicle } from './services.js'
import { createGodSession, createTerminalSession, killGodSession, listGodSockets } from './gods.js'
import { attachPty, detachPty, sendToPty, resizePty, ptyProcesses, getOutputBuffer, clearOutputBuffer, killPty } from './pty.js'
import { listSessions } from './history.js'
import * as git from './git.js'
import * as linear from './linear.js'
import * as calendar from './calendar.js'
import * as layout from './layout.js'

// Entity type definitions with display info
const ENTITY_TYPES = {
  god: { icon: '⚡', label: 'God' },
  terminal: { icon: '🖥️', label: 'Terminal' },
  browser: { icon: '🌐', label: 'Browser' },
  code: { icon: '📝', label: 'Code' },
  git: { icon: '⚙️', label: 'Git' },
  history: { icon: '📜', label: 'History' },
  linear: { icon: '✓', label: 'Linear' },
  calendar: { icon: '📅', label: 'Calendar' },
  settings: { icon: '⚙️', label: 'Settings' },
  cemetery: { icon: '🪦', label: 'Cemetery' },
  oracle: { icon: '🔮', label: 'Oracle' },
  'youtube-music': { icon: '🎵', label: 'YouTube Music' },
  messenger: { icon: '💬', label: 'Messenger' },
  discord: { icon: '🎮', label: 'Discord' }
}

// Add a god to the cemetery before banishing
function addToCemetery(entity) {
  if (entity.type !== 'god') return  // Only gods go to cemetery, not terminals

  const godKey = entity.id.toLowerCase()
  const pantheonGod = PANTHEON[godKey] || { color: '#888', voice: 'emma' }
  const tab = appState.tabs.find(t => t.id === entity.tabId)

  const fallen = {
    id: entity.id,
    name: entity.name || entity.id,
    color: entity.color || pantheonGod.color,
    voice: pantheonGod.voice,
    mission: entity.mission || null,
    title: entity.title || null,
    banishedAt: Date.now(),
    tabName: tab?.name || 'Unknown',
    sessionId: entity.sessionId || null  // Use the entity's tracked session ID
  }

  appState.cemetery.unshift(fallen)  // Add to front (newest first)
}

function getRandomRealmName() {
  const usedNames = new Set(appState.tabs.map(t => t.name))
  const available = REALMS.filter(r => !usedNames.has(r))

  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)]
  }

  // All realms used, add numeral
  let counter = 2
  while (true) {
    const candidate = `${REALMS[Math.floor(Math.random() * REALMS.length)]} ${counter}`
    if (!usedNames.has(candidate)) return candidate
    counter++
  }
}

export function handleMessage(ws, msg, projectRoot) {
  const { event, ...data } = msg

  switch (event) {
    // God lifecycle
    case 'god:spawn': {
      console.log('[god:spawn] Received:', data)
      // If no name provided, pick a random available god from pantheon
      let godName = data.name
      if (!godName) {
        const pantheonNames = Object.keys(PANTHEON)
        const usedNames = new Set(Object.keys(appState.entities).map(n => n.toLowerCase()))
        const available = pantheonNames.filter(n => !usedNames.has(n))
        godName = available.length > 0
          ? available[Math.floor(Math.random() * available.length)]
          : pantheonNames[Math.floor(Math.random() * pantheonNames.length)]
      }
      // Clear any orphaned buffer from a previous incarnation
      clearOutputBuffer(godName)
      const god = createGodSession(godName, data.task, projectRoot, {
        startPrompt: appState.settings?.startPrompt,
        userName: appState.settings?.userName
      })
      console.log('[god:spawn] createGodSession returned:', god ? { name: god.name, exists: god.exists } : null)
      if (god && !god.exists) {
        appState.entities[god.name] = {
          id: god.name,
          type: 'god',
          name: god.name,
          tabId: appState.activeTabId,
          order: getNextOrder(appState.activeTabId),
          mission: god.mission || null,
          spawnedAt: Date.now(),
          sessionId: god.sessionId || null
        }

        // Create a new stage for this entity
        const tab = appState.tabs.find(t => t.id === appState.activeTabId)
        if (tab) {
          const stageId = generateStageId()
          const tileId = layout.createTile([god.name], god.name)
          const newStage = { id: stageId, layout: tileId }
          tab.stages.push(newStage)
          tab.activeStageId = stageId
          appState.focusedTile = tileId.id
        }

        appState.focusedEntity = god.name
        saveState()
        console.log('[god:spawn] SUCCESS - broadcasting state')
        broadcastState()
      } else if (god?.exists) {
        console.log('[god:spawn] God already exists, sending spawned event')
        ws.send(JSON.stringify({ event: 'god:spawned', ...god }))
      } else {
        console.log('[god:spawn] FAILED - god is null or undefined')
      }
      break
    }

    case 'terminal:spawn': {
      // Clear any orphaned buffer from a previous incarnation
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
        appState.entities[terminal.name] = {
          id: terminal.name,
          type: 'terminal',
          name: terminal.displayName || terminal.name,
          tabId: appState.activeTabId,
          order: getNextOrder(appState.activeTabId),
          spawnedAt: Date.now(),
          color: terminal.color
        }

        // Create a new stage for this entity
        const tab = appState.tabs.find(t => t.id === appState.activeTabId)
        if (tab) {
          const stageId = generateStageId()
          const tileNode = layout.createTile([terminal.name], terminal.name)
          const newStage = { id: stageId, layout: tileNode }
          tab.stages.push(newStage)
          tab.activeStageId = stageId
          appState.focusedTile = tileNode.id
        }

        appState.focusedEntity = terminal.name
        saveState()
        broadcastState()
      } else if (terminal?.exists) {
        ws.send(JSON.stringify({ event: 'god:spawned', ...terminal }))
      }
      break
    }

    case 'god:kill':
    case 'entity:kill': {
      const entityId = data.entityId || data.godName || data.name
      const entity = appState.entities[entityId]
      const entityTabId = entity?.tabId

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

      delete appState.entities[entityId]

      // Remove from stage's layout (and remove stage if empty)
      if (entityTabId) {
        const tab = appState.tabs.find(t => t.id === entityTabId)
        if (tab) {
          // Find and update the stage containing this entity
          const stage = findStageByEntity(tab, entityId)
          if (stage) {
            stage.layout = layout.removeEntityFromLayout(stage.layout, entityId)
            // Remove stage if layout became null (all entities gone)
            if (!stage.layout) {
              tab.stages = tab.stages.filter(s => s.id !== stage.id)
              // Update activeStageId if needed
              if (tab.activeStageId === stage.id) {
                tab.activeStageId = tab.stages[0]?.id || null
              }
            }
          }
          normalizeTabOrder(entityTabId)
          // Delete tab if it has no more stages
          deleteTabIfEmpty(entityTabId)
        }
      }

      if (appState.focusedEntity === entityId) {
        // Get the killed entity's order to find its neighbor
        const killedOrder = entity?.order || 0

        // Find remaining entities in the ENTITY'S tab (not active tab), sorted by order
        const remaining = Object.entries(appState.entities)
          .filter(([_, e]) => e.tabId === entityTabId)
          .sort((a, b) => (a[1].order || 0) - (b[1].order || 0))

        // Find previous entity (highest order that's < killedOrder)
        // Falls back to next if no previous exists
        let newFocused = null
        for (let i = remaining.length - 1; i >= 0; i--) {
          if ((remaining[i][1].order || 0) < killedOrder) {
            newFocused = remaining[i][0]
            break
          }
        }
        if (!newFocused && remaining.length > 0) {
          newFocused = remaining[0][0]  // fallback to first remaining
        }

        appState.focusedEntity = newFocused

        // Switch to that entity's stage (if entity was in active tab)
        if (appState.focusedEntity && entityTabId === appState.activeTabId) {
          const tab = appState.tabs.find(t => t.id === appState.activeTabId)
          if (tab) {
            const stage = findStageByEntity(tab, appState.focusedEntity)
            if (stage) {
              tab.activeStageId = stage.id
            }
          }
        }
      }
      saveState()
      broadcastState()
      break
    }

    case 'god:list': {
      const gods = listGodSockets()
      ws.send(JSON.stringify({ event: 'god:list', gods }))
      break
    }

    case 'god:set-title':
    case 'entity:set-title': {
      const entityId = data.entityId || data.godName
      const title = data.title
      if (entityId && appState.entities[entityId]) {
        appState.entities[entityId].title = title
        saveState()
        broadcastState()
      }
      break
    }

    case 'god:set-status':
    case 'entity:set-status': {
      const entityId = data.entityId || data.godName
      const status = data.status
      if (entityId && appState.entities[entityId]) {
        appState.entities[entityId].status = status
        saveState()
        broadcastState()
      }
      break
    }

    case 'god:set-ready':
    case 'entity:set-ready': {
      const entityId = data.entityId || data.godName
      const readyState = data.readyState
      if (entityId && appState.entities[entityId]) {
        appState.entities[entityId].readyState = readyState
        saveState()
        broadcastState()
      }
      break
    }

    case 'god:peek':
    case 'entity:peek': {
      const entityId = data.entityId || data.godName
      const lines = data.lines || 50
      const output = getOutputBuffer(entityId, lines)
      ws.send(JSON.stringify({
        event: 'entity:peek:response',
        entityId,
        output,
        lines: output.split('\n').length
      }))
      break
    }

    case 'service:start': {
      const service = data.service
      if (service === 'chronicle') {
        // Chronicle is a mode within hear, not a separate service
        startChronicle()
      } else if (service && SERVICES[service]) {
        startService(service, projectRoot)
      }
      break
    }

    case 'service:stop': {
      const service = data.service
      if (service === 'chronicle') {
        // Chronicle is a mode within hear, not a separate service
        stopChronicle()
      } else if (service && SERVICES[service]) {
        stopService(service)
      }
      break
    }

    // PTY management
    case 'pty:attach': {
      attachPty(data.godName, ws, data.cols, data.rows)
      break
    }

    case 'pty:detach': {
      detachPty(data.godName, ws)
      break
    }

    case 'pty:input': {
      const entityId = data.entityId || data.godName
      // Reset readyState when user types to an entity
      if (appState.entities[entityId]?.readyState &&
          appState.entities[entityId].readyState !== 'working') {
        appState.entities[entityId].readyState = 'working'
        saveState()
        broadcastState()
      }
      sendToPty(entityId, data.data)
      break
    }

    case 'pty:resize': {
      resizePty(data.godName, data.cols, data.rows)
      break
    }

    // Tab management
    case 'tab:add': {
      appState.tabCounter++
      const newTab = { id: appState.tabCounter, name: data.name || getRandomRealmName(), stages: [], activeStageId: null }
      appState.tabs.push(newTab)
      appState.activeTabId = newTab.id
      saveState()
      broadcastState()
      break
    }

    case 'tab:remove': {
      const tabId = data.tabId

      // Remove all entities in this tab (and clean up PTYs for god/terminal types)
      Object.keys(appState.entities).forEach(id => {
        const entity = appState.entities[id]
        if (entity.tabId === tabId) {
          // Add gods to cemetery before banishing
          if (entity.type === 'god') {
            addToCemetery(entity)
          }

          if (entity.type === 'god' || entity.type === 'terminal') {
            killPty(id)
            killGodSession(id)
            clearOutputBuffer(id)
          }
          delete appState.entities[id]
        }
      })

      appState.tabs = appState.tabs.filter(t => t.id !== tabId)
      if (appState.tabs.length === 0) {
        appState.tabs = [{ id: 1, name: 'Olympus' }]
        appState.tabCounter = 1
        appState.activeTabId = 1
      } else if (appState.activeTabId === tabId) {
        appState.activeTabId = appState.tabs[0].id
      }

      // Reset focusedEntity if it was in removed tab
      if (appState.focusedEntity && !appState.entities[appState.focusedEntity]) {
        const remaining = Object.entries(appState.entities)
          .filter(([_, e]) => e.tabId === appState.activeTabId)
          .sort((a, b) => a[1].order - b[1].order)
        appState.focusedEntity = remaining.length > 0 ? remaining[0][0] : null
      }

      saveState()
      broadcastState()
      break
    }

    case 'tab:select': {
      appState.activeTabId = data.tabId

      // Ensure focusedEntity is in new tab
      const entitiesInTab = Object.keys(appState.entities)
        .filter(id => appState.entities[id].tabId === data.tabId)
        .sort((a, b) => appState.entities[a].order - appState.entities[b].order)

      if (!entitiesInTab.includes(appState.focusedEntity)) {
        appState.focusedEntity = entitiesInTab[0] || null
      }

      saveState()
      broadcastState()
      break
    }

    case 'tab:rename': {
      const tab = appState.tabs.find(t => t.id === data.tabId)
      if (tab) tab.name = data.name
      saveState()
      broadcastState()
      break
    }

    case 'god:move':
    case 'entity:move': {
      const entityId = data.entityId || data.godName
      const entity = appState.entities[entityId]
      if (entity) {
        const sourceTabId = entity.tabId
        const destTabId = data.tabId

        // Remove from source tab's stage layout
        const sourceTab = appState.tabs.find(t => t.id === sourceTabId)
        if (sourceTab) {
          const sourceStage = findStageByEntity(sourceTab, entityId)
          if (sourceStage) {
            sourceStage.layout = layout.removeEntityFromLayout(sourceStage.layout, entityId)
            // Remove source stage if empty
            if (!sourceStage.layout) {
              sourceTab.stages = sourceTab.stages.filter(s => s.id !== sourceStage.id)
              if (sourceTab.activeStageId === sourceStage.id) {
                sourceTab.activeStageId = sourceTab.stages[0]?.id || null
              }
            }
          }
        }

        // Move to destination tab with next order
        entity.tabId = destTabId
        entity.order = getNextOrder(destTabId)

        // Create a new stage for this entity in the destination tab
        const destTab = appState.tabs.find(t => t.id === destTabId)
        if (destTab) {
          const stageId = generateStageId()
          const tileNode = layout.createTile([entityId], entityId)
          const newStage = { id: stageId, layout: tileNode }
          destTab.stages = destTab.stages || []
          destTab.stages.push(newStage)
          destTab.activeStageId = stageId
          appState.focusedTile = tileNode.id
        }

        // Normalize both tabs
        normalizeTabOrder(sourceTabId)
        normalizeTabOrder(destTabId)

        // Delete source tab if it has no more stages
        deleteTabIfEmpty(sourceTabId)

        appState.focusedEntity = entityId
      }
      saveState()
      broadcastState()
      break
    }

    case 'god:move-to-new-tab':
    case 'entity:move-to-new-tab': {
      const entityId = data.entityId || data.godName
      const entity = appState.entities[entityId]
      const sourceTabId = entity?.tabId

      // Remove from source tab's stage layout first
      if (sourceTabId) {
        const sourceTab = appState.tabs.find(t => t.id === sourceTabId)
        if (sourceTab) {
          const sourceStage = findStageByEntity(sourceTab, entityId)
          if (sourceStage) {
            sourceStage.layout = layout.removeEntityFromLayout(sourceStage.layout, entityId)
            // Remove source stage if empty
            if (!sourceStage.layout) {
              sourceTab.stages = sourceTab.stages.filter(s => s.id !== sourceStage.id)
              if (sourceTab.activeStageId === sourceStage.id) {
                sourceTab.activeStageId = sourceTab.stages[0]?.id || null
              }
            }
          }
        }
      }

      appState.tabCounter++
      const stageId = generateStageId()
      const tileNode = layout.createTile([entityId], entityId)
      const newTab = {
        id: appState.tabCounter,
        name: getRandomRealmName(),
        stages: [{ id: stageId, layout: tileNode }],
        activeStageId: stageId
      }
      appState.tabs.push(newTab)
      appState.activeTabId = newTab.id
      appState.focusedTile = tileNode.id

      if (entity) {
        entity.tabId = newTab.id
        entity.order = 0

        // Normalize source tab after removal
        if (sourceTabId) {
          normalizeTabOrder(sourceTabId)
          // Delete source tab if it has no more stages
          deleteTabIfEmpty(sourceTabId)
        }
      }
      appState.focusedEntity = entityId
      saveState()
      broadcastState()
      break
    }

    case 'theme:set': {
      appState.theme = data.theme
      saveState()
      broadcastState()
      break
    }

    // Spawn a view entity (browser, git, history, linear, settings)
    case 'entity:spawn': {
      const type = data.type
      if (!ENTITY_TYPES[type] || type === 'god' || type === 'terminal') {
        // Use god:spawn or terminal:spawn for those
        break
      }

      const entityId = generateEntityId(type)
      const num = getNextEntityNumber(type)

      appState.entities[entityId] = {
        id: entityId,
        type,
        name: data.name || `${ENTITY_TYPES[type].label}-${num}`,
        tabId: appState.activeTabId,
        order: getNextOrder(appState.activeTabId),
        spawnedAt: Date.now(),
        // Type-specific data
        url: data.url || null,
        project: data.project || null
      }

      // Create a new stage for this entity
      const tab = appState.tabs.find(t => t.id === appState.activeTabId)
      if (tab) {
        const stageId = generateStageId()
        const tileNode = layout.createTile([entityId], entityId)
        const newStage = { id: stageId, layout: tileNode }
        tab.stages.push(newStage)
        tab.activeStageId = stageId
        appState.focusedTile = tileNode.id
      }

      appState.focusedEntity = entityId
      saveState()
      broadcastState()
      break
    }

    // Update browser entity URL
    case 'browser:navigate': {
      const entityId = data.entityId
      const url = data.url
      if (entityId && url && appState.entities[entityId]?.type === 'browser') {
        appState.entities[entityId].url = url
        saveState()
        broadcastState()
      }
      break
    }

    case 'focus:set': {
      const entityId = data.entityId || data.godName
      appState.focusedEntity = entityId || null

      // Find which stage contains this entity and switch to it
      if (entityId) {
        const tab = appState.tabs.find(t => t.id === appState.activeTabId)
        if (tab) {
          const stage = findStageByEntity(tab, entityId)
          if (stage) {
            tab.activeStageId = stage.id
            const tile = layout.findTileByEntity(stage.layout, entityId)
            if (tile) {
              appState.focusedTile = tile.id
            }
          }
        }
      }

      saveState()
      broadcastState()
      break
    }

    case 'tile:focus':
    case 'pane:focus': {  // Legacy alias
      const tileId = data.tileId || data.paneId
      if (!tileId) break

      const tab = appState.tabs.find(t => t.id === appState.activeTabId)
      if (!tab) break

      // Find tile in active stage
      const activeStage = getActiveStage(tab)
      if (!activeStage?.layout) break

      const tileResult = layout.findTile(activeStage.layout, tileId)
      if (!tileResult) break

      const tile = tileResult.node
      appState.focusedTile = tileId
      appState.focusedEntity = tile.entityId || tile.focusedEntityId || tile.entityIds?.[0] || null

      saveState()
      broadcastState()
      break
    }

    case 'focus:next':
    case 'focus:prev': {
      const tab = appState.tabs.find(t => t.id === appState.activeTabId)
      if (!tab || !tab.stages.length) break

      // Get all entities in this tab (across all stages)
      const entitiesInTab = Object.values(appState.entities)
        .filter(e => e.tabId === appState.activeTabId)
        .sort((a, b) => (a.order || 0) - (b.order || 0))

      if (entitiesInTab.length === 0) break

      // Find current index
      const currentIdx = entitiesInTab.findIndex(e => e.id === appState.focusedEntity)
      let newIdx

      if (event === 'focus:next') {
        newIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % entitiesInTab.length
      } else {
        newIdx = currentIdx < 0 ? entitiesInTab.length - 1 : (currentIdx - 1 + entitiesInTab.length) % entitiesInTab.length
      }

      const newEntityId = entitiesInTab[newIdx].id
      appState.focusedEntity = newEntityId

      // Switch to the stage containing this entity
      const stage = findStageByEntity(tab, newEntityId)
      if (stage) {
        tab.activeStageId = stage.id
        const tile = layout.findTileByEntity(stage.layout, newEntityId)
        if (tile) {
          appState.focusedTile = tile.id
        }
      }

      saveState()
      broadcastState()
      break
    }

    case 'gods:reorder':
    case 'entities:reorder': {
      // data.order: array of entity IDs in new order
      const { order } = data
      if (!Array.isArray(order)) break

      // Update order values for each entity in the array
      order.forEach((id, idx) => {
        if (appState.entities[id]) {
          appState.entities[id].order = idx
        }
      })

      saveState()
      broadcastState()
      break
    }

    case 'nvim:spawn': {
      const terminal = createTerminalSession({
        command: 'nvim',
        name: data.name,
        color: '#57A143'  // nvim green
      }, projectRoot)
      if (terminal && !terminal.exists) {
        appState.entities[terminal.name] = {
          id: terminal.name,
          type: 'terminal',
          name: terminal.displayName || terminal.name,
          tabId: appState.activeTabId,
          order: getNextOrder(appState.activeTabId),
          spawnedAt: Date.now(),
          color: terminal.color
        }

        // Create a new stage for this entity
        const tab = appState.tabs.find(t => t.id === appState.activeTabId)
        if (tab) {
          const stageId = generateStageId()
          const tileNode = layout.createTile([terminal.name], terminal.name)
          const newStage = { id: stageId, layout: tileNode }
          tab.stages.push(newStage)
          tab.activeStageId = stageId
          appState.focusedTile = tileNode.id
        }

        appState.focusedEntity = terminal.name
        saveState()
        broadcastState()
      } else if (terminal?.exists) {
        ws.send(JSON.stringify({ event: 'god:spawned', ...terminal }))
      }
      break
    }

    // History management
    case 'history:list': {
      listSessions(projectRoot, data.limit || 20, data.offset || 0).then(sessions => {
        ws.send(JSON.stringify({ event: 'history:list', sessions }))
      }).catch(err => {
        console.error('Failed to list sessions:', err)
        ws.send(JSON.stringify({ event: 'history:list', sessions: [], error: err.message }))
      })
      break
    }

    case 'history:resume': {
      const god = createGodSession(data.name, '', projectRoot, { resumeSessionId: data.sessionId })
      if (god && !god.exists) {
        appState.entities[god.name] = {
          id: god.name,
          type: 'god',
          name: god.name,
          tabId: appState.activeTabId,
          order: getNextOrder(appState.activeTabId),
          mission: data.summary || null,
          spawnedAt: Date.now()
        }

        // Create a new stage for this entity
        const tab = appState.tabs.find(t => t.id === appState.activeTabId)
        if (tab) {
          const stageId = generateStageId()
          const tileNode = layout.createTile([god.name], god.name)
          const newStage = { id: stageId, layout: tileNode }
          tab.stages.push(newStage)
          tab.activeStageId = stageId
          appState.focusedTile = tileNode.id
        }

        appState.focusedEntity = god.name
        saveState()
        broadcastState()
      } else if (god?.exists) {
        ws.send(JSON.stringify({ event: 'god:spawned', ...god }))
      }
      break
    }

    // Git management
    case 'git:projects:add': {
      const projectPath = data.path
      if (!projectPath) break

      // Check if already added
      if (appState.gitProjects.some(p => p.path === projectPath)) {
        ws.send(JSON.stringify({ event: 'git:error', error: 'Project already added' }))
        break
      }

      // Verify it's a git repo
      git.isGitRepo(projectPath).then(isRepo => {
        if (!isRepo) {
          ws.send(JSON.stringify({ event: 'git:error', error: 'Not a git repository' }))
          return
        }

        const name = git.getProjectName(projectPath)
        appState.gitProjects.push({ path: projectPath, name })
        saveState()
        broadcastState()
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'git:error', error: err.message }))
      })
      break
    }

    case 'git:projects:remove': {
      const projectPath = data.path
      appState.gitProjects = appState.gitProjects.filter(p => p.path !== projectPath)
      saveState()
      broadcastState()
      break
    }

    case 'git:status': {
      const projectPath = data.project
      if (!projectPath) break

      git.getStatus(projectPath).then(status => {
        git.getCurrentBranch(projectPath).then(branch => {
          ws.send(JSON.stringify({
            event: 'git:status:response',
            project: projectPath,
            branch,
            ...status
          }))
        })
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'git:error', project: projectPath, error: err.message }))
      })
      break
    }

    case 'git:diff': {
      const { project, file, mode, ref1, ref2, staged } = data
      if (!project) break

      const diffFn = staged ? git.getStagedDiff : git.getDiff
      diffFn(project, file || null, ref1 || null, ref2 || null).then(diff => {
        ws.send(JSON.stringify({
          event: 'git:diff:response',
          project,
          file: file || null,
          staged: !!staged,
          diff
        }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'git:error', project, error: err.message }))
      })
      break
    }

    case 'git:stage': {
      const { project, files } = data
      if (!project || !files) break

      git.stageFiles(project, files).then(() => {
        // Return updated status
        return git.getStatus(project)
      }).then(status => {
        ws.send(JSON.stringify({
          event: 'git:status:response',
          project,
          ...status
        }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'git:error', project, error: err.message }))
      })
      break
    }

    case 'git:unstage': {
      const { project, files } = data
      if (!project || !files) break

      git.unstageFiles(project, files).then(() => {
        return git.getStatus(project)
      }).then(status => {
        ws.send(JSON.stringify({
          event: 'git:status:response',
          project,
          ...status
        }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'git:error', project, error: err.message }))
      })
      break
    }

    case 'git:discard': {
      const { project, files } = data
      if (!project || !files) break

      git.discardChanges(project, files).then(() => {
        return git.getStatus(project)
      }).then(status => {
        ws.send(JSON.stringify({
          event: 'git:status:response',
          project,
          ...status
        }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'git:error', project, error: err.message }))
      })
      break
    }

    case 'git:commits': {
      const { project, limit } = data
      if (!project) break

      git.getCommits(project, limit || 50).then(commits => {
        ws.send(JSON.stringify({
          event: 'git:commits:response',
          project,
          commits
        }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'git:error', project, error: err.message }))
      })
      break
    }

    case 'git:branches': {
      const { project } = data
      if (!project) break

      Promise.all([
        git.getBranches(project),
        git.getCurrentBranch(project)
      ]).then(([branches, current]) => {
        ws.send(JSON.stringify({
          event: 'git:branches:response',
          project,
          branches,
          current
        }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'git:error', project, error: err.message }))
      })
      break
    }

    // Linear management
    case 'linear:issues:fetch': {
      if (!linear.isConfigured()) {
        ws.send(JSON.stringify({
          event: 'linear:error',
          error: 'LINEAR_API_KEY not configured. Set the environment variable to use Linear.'
        }))
        break
      }

      linear.getMyIssues(data.limit || 50).then(issues => {
        ws.send(JSON.stringify({
          event: 'linear:issues:response',
          issues
        }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'linear:error', error: err.message }))
      })
      break
    }

    case 'linear:issue:get': {
      const { id } = data
      if (!id) break

      if (!linear.isConfigured()) {
        ws.send(JSON.stringify({
          event: 'linear:error',
          error: 'LINEAR_API_KEY not configured'
        }))
        break
      }

      linear.getIssue(id).then(issue => {
        ws.send(JSON.stringify({
          event: 'linear:issue:response',
          issue
        }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'linear:error', error: err.message }))
      })
      break
    }

    case 'linear:teams:fetch': {
      if (!linear.isConfigured()) {
        ws.send(JSON.stringify({ event: 'linear:error', error: 'LINEAR_API_KEY not configured' }))
        break
      }

      linear.getTeams().then(teams => {
        ws.send(JSON.stringify({ event: 'linear:teams:response', teams }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'linear:error', error: err.message }))
      })
      break
    }

    case 'linear:states:fetch': {
      const { teamId } = data
      if (!teamId) break

      if (!linear.isConfigured()) {
        ws.send(JSON.stringify({ event: 'linear:error', error: 'LINEAR_API_KEY not configured' }))
        break
      }

      linear.getStates(teamId).then(states => {
        ws.send(JSON.stringify({ event: 'linear:states:response', teamId, states }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'linear:error', error: err.message }))
      })
      break
    }

    case 'linear:issue:update-status': {
      const { issueId, stateId } = data
      if (!issueId || !stateId) break

      if (!linear.isConfigured()) {
        ws.send(JSON.stringify({ event: 'linear:error', error: 'LINEAR_API_KEY not configured' }))
        break
      }

      linear.updateIssueStatus(issueId, stateId).then(result => {
        ws.send(JSON.stringify({ event: 'linear:issue:updated', ...result }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'linear:error', error: err.message }))
      })
      break
    }

    case 'linear:issue:create': {
      const { title, teamId, description, priority } = data
      if (!title || !teamId) break

      if (!linear.isConfigured()) {
        ws.send(JSON.stringify({ event: 'linear:error', error: 'LINEAR_API_KEY not configured' }))
        break
      }

      linear.createIssue({ title, teamId, description, priority }).then(result => {
        ws.send(JSON.stringify({ event: 'linear:issue:created', ...result }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'linear:error', error: err.message }))
      })
      break
    }

    case 'linear:comment:create': {
      const { issueId, body } = data
      if (!issueId || !body) break

      if (!linear.isConfigured()) {
        ws.send(JSON.stringify({ event: 'linear:error', error: 'LINEAR_API_KEY not configured' }))
        break
      }

      linear.addComment(issueId, body).then(result => {
        ws.send(JSON.stringify({ event: 'linear:comment:created', issueId, ...result }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'linear:error', error: err.message }))
      })
      break
    }

    // Calendar management
    case 'calendar:status': {
      const info = calendar.getConnectionInfo()
      ws.send(JSON.stringify({ event: 'calendar:status:response', ...info }))
      break
    }

    case 'calendar:auth:start': {
      if (!calendar.isConfigured()) {
        ws.send(JSON.stringify({
          event: 'calendar:error',
          error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'
        }))
        break
      }

      try {
        const authUrl = calendar.getAuthUrl()
        ws.send(JSON.stringify({ event: 'calendar:auth:url', url: authUrl }))
      } catch (err) {
        ws.send(JSON.stringify({ event: 'calendar:error', error: err.message }))
      }
      break
    }

    case 'calendar:auth:callback': {
      const { code } = data
      if (!code) {
        ws.send(JSON.stringify({ event: 'calendar:error', error: 'No authorization code provided' }))
        break
      }

      calendar.handleAuthCallback(code).then(result => {
        ws.send(JSON.stringify({ event: 'calendar:auth:success', ...result }))
        broadcastState()
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'calendar:error', error: err.message }))
      })
      break
    }

    case 'calendar:disconnect': {
      calendar.disconnect()
      ws.send(JSON.stringify({ event: 'calendar:disconnected' }))
      broadcastState()
      break
    }

    case 'calendar:events:fetch': {
      if (!calendar.isConnected()) {
        ws.send(JSON.stringify({
          event: 'calendar:error',
          error: 'Google Calendar not connected. Connect in Settings.'
        }))
        break
      }

      const { timeMin, timeMax, calendarId } = data
      calendar.listEvents(timeMin, timeMax, calendarId).then(events => {
        ws.send(JSON.stringify({ event: 'calendar:events:response', events }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'calendar:error', error: err.message }))
      })
      break
    }

    case 'calendar:event:get': {
      const { eventId, calendarId } = data
      if (!eventId) break

      if (!calendar.isConnected()) {
        ws.send(JSON.stringify({ event: 'calendar:error', error: 'Google Calendar not connected' }))
        break
      }

      calendar.getEvent(eventId, calendarId).then(event => {
        ws.send(JSON.stringify({ event: 'calendar:event:response', calendarEvent: event }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'calendar:error', error: err.message }))
      })
      break
    }

    case 'calendar:event:create': {
      const { summary, start, end, description, location, calendarId } = data
      if (!summary || !start) {
        ws.send(JSON.stringify({ event: 'calendar:error', error: 'Summary and start time required' }))
        break
      }

      if (!calendar.isConnected()) {
        ws.send(JSON.stringify({ event: 'calendar:error', error: 'Google Calendar not connected' }))
        break
      }

      calendar.createEvent({ summary, start, end, description, location }, calendarId).then(event => {
        ws.send(JSON.stringify({ event: 'calendar:event:created', calendarEvent: event }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'calendar:error', error: err.message }))
      })
      break
    }

    case 'calendar:event:update': {
      const { eventId, updates, calendarId } = data
      if (!eventId) break

      if (!calendar.isConnected()) {
        ws.send(JSON.stringify({ event: 'calendar:error', error: 'Google Calendar not connected' }))
        break
      }

      calendar.updateEvent(eventId, updates, calendarId).then(event => {
        ws.send(JSON.stringify({ event: 'calendar:event:updated', calendarEvent: event }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'calendar:error', error: err.message }))
      })
      break
    }

    case 'calendar:event:delete': {
      const { eventId, calendarId } = data
      if (!eventId) break

      if (!calendar.isConnected()) {
        ws.send(JSON.stringify({ event: 'calendar:error', error: 'Google Calendar not connected' }))
        break
      }

      calendar.deleteEvent(eventId, calendarId).then(() => {
        ws.send(JSON.stringify({ event: 'calendar:event:deleted', eventId }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'calendar:error', error: err.message }))
      })
      break
    }

    case 'calendar:calendars:fetch': {
      if (!calendar.isConnected()) {
        ws.send(JSON.stringify({ event: 'calendar:error', error: 'Google Calendar not connected' }))
        break
      }

      calendar.listCalendars().then(calendars => {
        ws.send(JSON.stringify({ event: 'calendar:calendars:response', calendars }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'calendar:error', error: err.message }))
      })
      break
    }

    // Settings management
    case 'settings:update': {
      const { key, value } = data
      if (!key) break

      // Initialize settings if needed
      if (!appState.settings) {
        appState.settings = {}
      }

      // Update the setting
      appState.settings[key] = value

      // Apply to environment if it's an API key
      applySettingsToEnv()

      saveState()
      broadcastState()
      break
    }

    // Cemetery management
    case 'cemetery:resurrect': {
      const { godId, sessionId, name, mission, title } = data
      if (!sessionId) break

      // Use the original god name or fall back to provided name
      const godName = godId || name
      if (!godName) break

      // If there's an existing entity with this name, clean it up first
      const existingEntity = appState.entities[godName]
      const existingTabId = existingEntity?.tabId
      if (existingEntity) {
        // Add current god to cemetery before replacing
        if (existingEntity.type === 'god') {
          addToCemetery(existingEntity)
        }
        // Clean up PTY
        killPty(godName)
        clearOutputBuffer(godName)
        delete appState.entities[godName]

        // Normalize the tab where the existing entity was removed
        if (existingTabId) {
          normalizeTabOrder(existingTabId)
        }
      }

      // Resume the session with the god's name
      const god = createGodSession(godName, '', projectRoot, { resumeSessionId: sessionId })
      if (god && !god.exists) {
        appState.entities[god.name] = {
          id: god.name,
          type: 'god',
          name: god.name,
          tabId: appState.activeTabId,
          order: getNextOrder(appState.activeTabId),
          spawnedAt: Date.now(),
          mission: mission || null,
          title: title || null,
          sessionId: sessionId  // Preserve sessionId for re-banish
        }

        // Create a new stage for this entity
        const tab = appState.tabs.find(t => t.id === appState.activeTabId)
        if (tab) {
          const stageId = generateStageId()
          const tileNode = layout.createTile([god.name], god.name)
          const newStage = { id: stageId, layout: tileNode }
          tab.stages.push(newStage)
          tab.activeStageId = stageId
          appState.focusedTile = tileNode.id
        }

        appState.focusedEntity = god.name

        // Remove from cemetery
        appState.cemetery = appState.cemetery.filter(f => f.sessionId !== sessionId)

        saveState()
        broadcastState()
      } else if (god?.exists) {
        ws.send(JSON.stringify({ event: 'god:spawned', ...god }))
      }
      break
    }

    case 'cemetery:remove': {
      const { sessionId } = data
      if (!sessionId) break
      appState.cemetery = appState.cemetery.filter(f => f.sessionId !== sessionId)
      saveState()
      broadcastState()
      break
    }

    case 'cemetery:clear': {
      appState.cemetery = []
      saveState()
      broadcastState()
      break
    }

    // Code viewer management
    case 'code:open': {
      const { filePath, line, entityId, forceNew } = data
      if (!filePath) break

      // Find or create a code entity
      let codeEntity = entityId ? appState.entities[entityId] : null
      let isNewEntity = false

      if (!codeEntity && !forceNew) {
        // Find first code entity in active tab (skip if forceNew)
        codeEntity = Object.values(appState.entities).find(
          e => e.type === 'code' && e.tabId === appState.activeTabId
        )
      }

      if (!codeEntity) {
        // Create a new code entity
        const newId = generateEntityId('code')
        const num = getNextEntityNumber('code')

        appState.entities[newId] = {
          id: newId,
          type: 'code',
          name: `Code-${num}`,
          tabId: appState.activeTabId,
          order: getNextOrder(appState.activeTabId),
          spawnedAt: Date.now()
        }
        codeEntity = appState.entities[newId]
        isNewEntity = true

        // Create a new stage for this entity
        const tab = appState.tabs.find(t => t.id === appState.activeTabId)
        if (tab) {
          const stageId = generateStageId()
          const tileNode = layout.createTile([newId], newId)
          const newStage = { id: stageId, layout: tileNode }
          tab.stages.push(newStage)
          tab.activeStageId = stageId
          appState.focusedTile = tileNode.id
        }
      }

      // Store pending file in entity (for new entities, CodeView will load on mount)
      codeEntity.pendingFile = filePath
      codeEntity.pendingLine = line || 1

      appState.focusedEntity = codeEntity.id
      saveState()
      broadcastState()

      // For existing entities, also broadcast event (CodeView is already mounted)
      if (!isNewEntity) {
        broadcast('code:file:open', {
          entityId: codeEntity.id,
          filePath,
          line: line || 1
        })
      }
      break
    }

    case 'code:highlight': {
      const { filePath, highlights } = data
      if (!filePath || !highlights) break

      // Initialize code highlights in app state if needed
      if (!appState.codeHighlights) {
        appState.codeHighlights = {}
      }

      // Merge new highlights with existing ones
      const existing = appState.codeHighlights[filePath] || []
      appState.codeHighlights[filePath] = [...existing, ...highlights]

      saveState()
      broadcastState()
      break
    }

    case 'code:highlight:clear': {
      const { filePath } = data
      if (!appState.codeHighlights) break

      if (filePath) {
        delete appState.codeHighlights[filePath]
      } else {
        appState.codeHighlights = {}
      }

      saveState()
      broadcastState()
      break
    }

    case 'code:files:sync': {
      // Sync open files from code viewer to entity state
      const { entityId, openFiles, activeFilePath, rootPath } = data
      const logLine = `[${new Date().toISOString()}] [code:files:sync] entityId=${entityId} rootPath=${rootPath} activeFilePath=${activeFilePath}\n`
      fs.appendFileSync(path.join(LOGS_DIR, 'code-sync.log'), logLine)
      if (!entityId || !appState.entities[entityId]) break

      appState.entities[entityId].openFiles = openFiles || []
      appState.entities[entityId].activeFilePath = activeFilePath || null

      // Update name and title to project root folder name
      if (rootPath) {
        const folderName = path.basename(rootPath)
        appState.entities[entityId].name = folderName
        appState.entities[entityId].title = folderName
      }

      // Update status to current file path
      if (activeFilePath) {
        appState.entities[entityId].status = activeFilePath
      }

      saveState()
      broadcastState()
      break
    }

    // Frontend error reporting
    case 'error:report': {
      const { error } = data
      if (!error) break

      // Ensure logs dir exists
      if (!fs.existsSync(LOGS_DIR)) {
        fs.mkdirSync(LOGS_DIR, { recursive: true })
      }

      const logFile = path.join(LOGS_DIR, 'frontend-errors.log')
      const timestamp = new Date().toISOString()
      const logEntry = [
        `[${timestamp}]`,
        `Source: ${error.source || 'unknown'}`,
        `Message: ${error.message || 'No message'}`,
        error.stack ? `Stack: ${error.stack}` : null,
        error.context ? `Context: ${JSON.stringify(error.context)}` : null,
        '---'
      ].filter(Boolean).join('\n') + '\n'

      fs.appendFileSync(logFile, logEntry)
      console.error('[Frontend Error]', error.message, error.source ? `(${error.source})` : '')
      break
    }

    // ============ LAYOUT MANAGEMENT ============

    case 'layout:init': {
      // Initialize layout with first entity (when dropping on empty root)
      const { tabId, entityId, entityType } = data
      const tab = appState.tabs.find(t => t.id === (tabId || appState.activeTabId))
      if (!tab) break

      // Create or get the entity
      let targetEntityId = entityId
      if (entityType && !entityId) {
        // Spawn new entity of this type - delegate to spawn handlers
        if (entityType === 'god') {
          const godColors = Object.keys(GOD_COLORS)
          const usedNames = Object.values(appState.entities).filter(e => e.type === 'god').map(e => e.name?.toLowerCase())
          const availableGods = godColors.filter(g => !usedNames.includes(g))
          const godPool = availableGods.length > 0 ? availableGods : godColors
          const randomGod = godPool[Math.floor(Math.random() * godPool.length)] || 'zeus'
          const godName = randomGod.charAt(0).toUpperCase() + randomGod.slice(1)
          handleMessage(ws, { event: 'god:spawn', name: godName, task: '' }, projectRoot)
          break
        } else if (entityType === 'terminal') {
          handleMessage(ws, { event: 'terminal:spawn' }, projectRoot)
          break
        } else {
          handleMessage(ws, { event: 'entity:spawn', type: entityType }, projectRoot)
          break
        }
      }

      // If moving existing entity, create a new stage for it
      if (targetEntityId) {
        const stageId = generateStageId()
        const tileNode = layout.createTile([targetEntityId], targetEntityId)
        const newStage = { id: stageId, layout: tileNode }
        tab.stages.push(newStage)
        tab.activeStageId = stageId
        appState.focusedTile = tileNode.id
        appState.focusedEntity = targetEntityId
      }

      saveState()
      broadcastState()
      break
    }

    case 'layout:split': {
      const { tabId, tileId, paneId, direction, position, entityId, entityType } = data
      const targetTileId = tileId || paneId  // Support both new and legacy names
      const tab = appState.tabs.find(t => t.id === (tabId || appState.activeTabId))
      if (!tab) break

      // Get active stage
      let activeStage = getActiveStage(tab)
      if (!activeStage?.layout) break

      // Check if we're dropping an entity onto its own tile (no-op)
      if (entityId) {
        const targetTile = layout.findTile(activeStage.layout, targetTileId)
        if (targetTile?.node?.entityId === entityId) {
          // Entity is already in this tile, nothing to do
          break
        }
      }

      // Create or get the entity to place in new tile
      let targetEntityId = entityId
      if (entityType && !entityId) {
        // Spawn new entity of this type
        const newId = generateEntityId(entityType)
        const num = getNextEntityNumber(entityType)

        appState.entities[newId] = {
          id: newId,
          type: entityType,
          name: `${ENTITY_TYPES[entityType]?.label || entityType}-${num}`,
          tabId: tab.id,
          order: getNextOrder(tab.id),
          spawnedAt: Date.now()
        }
        targetEntityId = newId
      }

      // If moving an existing entity, remove it from its current stage first
      if (entityId) {
        const sourceStage = findStageByEntity(tab, entityId)
        if (sourceStage) {
          const sourceIsActive = sourceStage.id === activeStage.id
          sourceStage.layout = layout.removeEntityFromLayout(sourceStage.layout, entityId)
          // Remove source stage if empty
          if (!sourceStage.layout) {
            tab.stages = tab.stages.filter(s => s.id !== sourceStage.id)
            // If we removed the active stage, re-fetch it (might have changed)
            if (sourceIsActive) {
              activeStage = getActiveStage(tab)
              // If no active stage, we need to create a new one for the split
              if (!activeStage) {
                const stageId = generateStageId()
                const tileNode = layout.createTile(null)
                const newStage = { id: stageId, layout: tileNode }
                tab.stages.push(newStage)
                tab.activeStageId = stageId
                activeStage = newStage
              }
            }
          }
        }
      }

      // Split the tile in active stage (if we still have one with a layout)
      if (activeStage?.layout) {
        activeStage.layout = layout.splitTile(activeStage.layout, targetTileId, direction, position, targetEntityId)
      } else {
        // No layout to split, just set this entity as the tile's entity
        activeStage.layout = layout.createTile(targetEntityId)
      }

      // Focus the new tile and entity
      const newTile = layout.findTileByEntity(activeStage.layout, targetEntityId)
      if (newTile) {
        appState.focusedTile = newTile.id
        appState.focusedEntity = targetEntityId
      }

      saveState()
      broadcastState()
      break
    }

    case 'layout:merge': {
      const { tabId, tileId, paneId } = data
      const targetTileId = tileId || paneId  // Support both new and legacy names
      const tab = appState.tabs.find(t => t.id === (tabId || appState.activeTabId))
      if (!tab) break

      const activeStage = getActiveStage(tab)
      if (!activeStage?.layout) break

      const { layout: newLayout, mergedEntityIds } = layout.mergeTile(activeStage.layout, targetTileId)
      activeStage.layout = newLayout

      // Update focused tile if it was merged
      if (appState.focusedTile === targetTileId) {
        const firstTile = layout.getFirstTile(activeStage.layout)
        appState.focusedTile = firstTile?.id || null
        appState.focusedEntity = firstTile?.entityId || firstTile?.focusedEntityId || firstTile?.entityIds?.[0] || null
      }

      saveState()
      broadcastState()
      break
    }

    case 'layout:resize': {
      const { tabId, splitId, ratio } = data
      const tab = appState.tabs.find(t => t.id === (tabId || appState.activeTabId))
      if (!tab) break

      const activeStage = getActiveStage(tab)
      if (!activeStage?.layout) break

      activeStage.layout = layout.updateSplitRatio(activeStage.layout, splitId, ratio)

      saveState()
      broadcastState()
      break
    }

    case 'layout:move-entity': {
      const { entityId, targetTileId, targetPaneId, dropPosition } = data
      const targetId = targetTileId || targetPaneId  // Support both new and legacy names
      const tab = appState.tabs.find(t => t.id === appState.activeTabId)
      if (!tab || !entityId) break

      const activeStage = getActiveStage(tab)
      if (!activeStage?.layout) break

      // Remove from source stage first
      const sourceStage = findStageByEntity(tab, entityId)
      if (sourceStage) {
        sourceStage.layout = layout.removeEntityFromLayout(sourceStage.layout, entityId)
        // Remove source stage if empty
        if (!sourceStage.layout) {
          tab.stages = tab.stages.filter(s => s.id !== sourceStage.id)
        }
      }

      if (dropPosition === 'center') {
        // Add to existing tile in active stage
        activeStage.layout = layout.addEntityToTile(activeStage.layout, targetId, entityId)
      } else {
        // Split the tile
        const direction = (dropPosition === 'left' || dropPosition === 'right') ? 'horizontal' : 'vertical'
        activeStage.layout = layout.splitTile(activeStage.layout, targetId, direction, dropPosition, entityId)
      }

      // Update focus
      const newTile = layout.findTileByEntity(activeStage.layout, entityId)
      if (newTile) {
        appState.focusedTile = newTile.id
        appState.focusedEntity = entityId
      }

      saveState()
      broadcastState()
      break
    }

    case 'tile:focus-entity':
    case 'pane:focus-entity': {  // Legacy alias
      const tileId = data.tileId || data.paneId
      const { entityId } = data
      const tab = appState.tabs.find(t => t.id === appState.activeTabId)
      if (!tab) break

      const activeStage = getActiveStage(tab)
      if (!activeStage?.layout) break

      activeStage.layout = layout.setFocusedEntityInTile(activeStage.layout, tileId, entityId)
      appState.focusedTile = tileId
      appState.focusedEntity = entityId

      saveState()
      broadcastState()
      break
    }

    case 'layout:add-entity-to-tile':
    case 'layout:add-entity-to-pane': {  // Legacy alias
      const tileId = data.tileId || data.paneId
      const { entityId, entityType } = data
      const tab = appState.tabs.find(t => t.id === appState.activeTabId)
      if (!tab) break

      const activeStage = getActiveStage(tab)
      if (!activeStage?.layout) break

      // Create entity if type provided
      let targetEntityId = entityId
      if (entityType && !entityId) {
        const newId = generateEntityId(entityType)
        const num = getNextEntityNumber(entityType)

        appState.entities[newId] = {
          id: newId,
          type: entityType,
          name: `${ENTITY_TYPES[entityType]?.label || entityType}-${num}`,
          tabId: tab.id,
          order: getNextOrder(tab.id),
          spawnedAt: Date.now()
        }
        targetEntityId = newId
      } else if (entityId) {
        // Moving existing entity - remove from its source stage first
        const sourceStage = findStageByEntity(tab, entityId)
        if (sourceStage) {
          sourceStage.layout = layout.removeEntityFromLayout(sourceStage.layout, entityId)
          // Remove source stage if empty
          if (!sourceStage.layout) {
            tab.stages = tab.stages.filter(s => s.id !== sourceStage.id)
          }
        }
      }

      // Add to tile in active stage
      activeStage.layout = layout.addEntityToTile(activeStage.layout, tileId, targetEntityId)

      appState.focusedTile = tileId
      appState.focusedEntity = targetEntityId

      saveState()
      broadcastState()
      break
    }

    // Split entity out of a multi-entity stage into its own new stage
    case 'stage:split': {
      const { entityId, stageId } = data
      if (!entityId) break

      const tab = appState.tabs.find(t => t.id === appState.activeTabId)
      if (!tab) break

      // Find the source stage
      const sourceStage = stageId
        ? tab.stages.find(s => s.id === stageId)
        : findStageByEntity(tab, entityId)
      if (!sourceStage?.layout) break

      // Remove entity from source stage's layout
      sourceStage.layout = layout.removeEntityFromLayout(sourceStage.layout, entityId)

      // If source stage is now empty, remove it
      if (!sourceStage.layout) {
        tab.stages = tab.stages.filter(s => s.id !== sourceStage.id)
      }

      // Create a new stage for the split-out entity
      const newStageId = generateStageId()
      const tileNode = layout.createTile([entityId], entityId)
      const newStage = { id: newStageId, layout: tileNode }
      tab.stages.push(newStage)

      // Switch to the new stage and focus the entity
      tab.activeStageId = newStageId
      appState.focusedTile = tileNode.id
      appState.focusedEntity = entityId

      saveState()
      broadcastState()
      break
    }

    // Forward other events to all clients
    default:
      broadcast(event, data)
  }
}
