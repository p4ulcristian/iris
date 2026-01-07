import fs from 'fs'
import path from 'path'
import { SERVICES, REALMS, PANTHEON, LOGS_DIR, GOD_COLORS } from './config.js'
import { appState, saveState, broadcastState, broadcast, applySettingsToEnv, generateEntityId, getNextEntityNumber, normalizeTabOrder, getNextOrder, generateStageId, findStageByEntity, getActiveStage, deleteTabIfEmpty, getEntityRegistry } from './state.js'
import { startService, stopService, startChronicle, stopChronicle } from './services.js'
import { createGodSession, createTerminalSession, killGodSession, listGodSockets } from './gods.js'
import { attachPty, detachPty, sendToPty, resizePty, ptyProcesses, getOutputBuffer, clearOutputBuffer, killPty } from './pty.js'
import { execSync } from 'child_process'
import { ZELLIJ_BIN, ZELLIJ_CONFIG_DIR } from './config.js'
import { getSessionName } from './gods.js'
import { listSessions } from './history.js'
import * as git from './git.js'
import * as linear from './linear.js'
import * as calendar from './calendar.js'
import * as layout from './layout.js'
import * as personalities from './personalities.js'
import * as traits from './traits.js'
import * as mcpServers from './mcp-servers.js'
import * as projects from './projects.js'

// Helper to get entity type info from registry (with fallback)
function getEntityType(type) {
  const registry = getEntityRegistry()
  return registry[type] || { label: type, icon: null, color: '#888888' }
}

// Add a god to the cemetery before banishing
function addToCemetery(entity) {
  if (entity.type !== 'god') return
  if (!entity.sessionId) return  // Can't resurrect without session ID

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
    sessionId: entity.sessionId
  }

  appState.cemetery.unshift(fallen)
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

      // Check if god already exists and is working
      const existingEntity = appState.entities[godName]
      if (existingEntity && existingEntity.readyState !== 'failed') {
        console.log('[god:spawn] God already exists:', godName)
        ws.send(JSON.stringify({ event: 'god:spawned', name: godName, exists: true }))
        break
      }
      // If entity exists but failed, we'll respawn it (entity will be overwritten below)

      // Determine working directory - use selected project path if provided
      let workingDir = projectRoot
      if (data.project) {
        const projectConfig = projects.loadProject(data.project)
        if (projectConfig?.path) {
          workingDir = projectConfig.path.replace(/^~/, process.env.HOME || '')
        }
      }

      // STEP 1: Add entity immediately with 'spawning' state
      appState.entities[godName] = {
        id: godName,
        type: 'god',
        name: godName,
        tabId: appState.activeTabId,
        order: getNextOrder(appState.activeTabId),
        mission: data.task || null,
        spawnedAt: Date.now(),
        sessionId: null,
        project: workingDir,
        readyState: 'spawning'
      }

      // Create stage for this entity
      const tab = appState.tabs.find(t => t.id === appState.activeTabId)
      if (tab) {
        const stageId = generateStageId()
        const tileId = layout.createTile([godName], godName)
        const newStage = { id: stageId, layout: tileId }
        tab.stages.push(newStage)
        tab.activeStageId = stageId
        appState.focusedTile = tileId.id
      }
      appState.focusedEntity = godName
      saveState()
      console.log('[god:spawn] Added spawning entity, broadcasting...')
      broadcastState()

      // STEP 2: Create the zellij session
      clearOutputBuffer(godName)
      console.log('[god:spawn] Calling createGodSession with:', { godName, task: data.task, workingDir, personality: data.personality })
      let god
      try {
        god = createGodSession(godName, data.task, workingDir, {
          startPrompt: appState.settings?.startPrompt,
          userName: appState.settings?.userName,
          personality: data.personality
        })
      } catch (err) {
        console.error('[god:spawn] createGodSession threw:', err)
      }
      console.log('[god:spawn] createGodSession returned:', god ? { name: god.name, exists: god.exists } : null)

      // STEP 3: Update state based on result
      if (!god) {
        // Spawn failed - update state to show failure
        console.error('[god:spawn] FAILED - createGodSession returned null')
        appState.entities[godName].readyState = 'failed'
        appState.entities[godName].status = 'Session failed to start'
        saveState()
        broadcastState()
        break
      }

      // Success - update to working state
      appState.entities[godName].readyState = 'working'
      appState.entities[godName].sessionId = god.sessionId || null
      saveState()
      console.log('[god:spawn] SUCCESS - broadcasting final state')
      broadcastState()
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

    // MCP Integration - run commands in god terminals
    case 'mcp:run': {
      const { requestId, godName, terminalName, command } = data
      if (!requestId || !command) {
        ws.send(JSON.stringify({
          event: 'mcp:run:response',
          requestId,
          error: 'Missing requestId or command'
        }))
        break
      }

      const targetGodName = godName || 'Hermes'
      const targetTerminalName = terminalName || `Terminal of ${targetGodName}`

      // Terminal ID follows createTerminalSession naming: sanitized + capitalized first letter
      const sanitized = targetTerminalName.toLowerCase().replace(/[^a-z0-9]/g, '-')
      const terminalId = sanitized.charAt(0).toUpperCase() + sanitized.slice(1)

      // Check if MCP terminal for this god already exists
      let terminal = appState.entities[terminalId]
      let actualTerminalId = terminalId

      if (!terminal) {
        // Create a new terminal for this god
        clearOutputBuffer(terminalId)
        const created = createTerminalSession({
          command: null,  // Just bash
          name: targetTerminalName,
          color: '#00ff88',  // MCP green
          cwd: projectRoot
        }, projectRoot)

        if (created && !created.exists) {
          // createTerminalSession uses its own naming, so use what it returns
          actualTerminalId = created.name

          appState.entities[actualTerminalId] = {
            id: actualTerminalId,
            type: 'terminal',
            name: created.displayName || targetTerminalName,
            tabId: appState.activeTabId,
            order: getNextOrder(appState.activeTabId),
            spawnedAt: Date.now(),
            color: '#00ff88',
            mcpGod: targetGodName
          }

          // Create a new stage for this entity
          const tab = appState.tabs.find(t => t.id === appState.activeTabId)
          if (tab) {
            const stageId = generateStageId()
            const tileNode = layout.createTile([actualTerminalId], actualTerminalId)
            const newStage = { id: stageId, layout: tileNode }
            tab.stages.push(newStage)
            tab.activeStageId = stageId
            appState.focusedTile = tileNode.id
          }

          appState.focusedEntity = actualTerminalId
          saveState()
          broadcastState()
          terminal = appState.entities[actualTerminalId]
        }
      }

      // Send command directly to Zellij session (bypasses PTY attachment requirement)
      const sessionName = getSessionName(actualTerminalId)
      const fs = require('fs')
      const outputFile = `/tmp/iris-mcp-${requestId}.out`
      const exitFile = `/tmp/iris-mcp-${requestId}.exit`

      // Helper to send command to zellij using byte values (write-chars doesn't handle newlines)
      const sendToZellij = (cmd) => {
        try {
          // Convert command to byte values
          const bytes = []
          for (let i = 0; i < cmd.length; i++) {
            bytes.push(cmd.charCodeAt(i))
          }
          bytes.push(13) // Add Enter key (carriage return)

          const byteArgs = bytes.join(' ')
          execSync(`"${ZELLIJ_BIN}" --config-dir "${ZELLIJ_CONFIG_DIR}" -s "${sessionName}" action write ${byteArgs}`, {
            timeout: 5000,
            stdio: 'pipe'
          })
          return true
        } catch (e) {
          console.error('Failed to send to zellij:', e.message)
          return false
        }
      }

      // Wait a bit for new terminals to initialize, then send command
      const initDelay = terminal ? 100 : 1500
      setTimeout(() => {
        // First send Ctrl+C to clear any stuck input (important for session recovery)
        try {
          execSync(`"${ZELLIJ_BIN}" --config-dir "${ZELLIJ_CONFIG_DIR}" -s "${sessionName}" action write 3`, {
            timeout: 1000,
            stdio: 'pipe'
          })
        } catch {}

        // Small delay after Ctrl+C
        setTimeout(() => {
          // Wrap command to capture output to a file (more reliable than dump-screen)
          // Use a subshell to capture both stdout and stderr
          const wrappedCommand = `( ${command} ) > "${outputFile}" 2>&1; echo $? > "${exitFile}"`

          const success = sendToZellij(wrappedCommand)

          if (!success) {
            ws.send(JSON.stringify({
              event: 'mcp:run:response',
              requestId,
              terminalId: actualTerminalId,
              godName: targetGodName,
              output: 'Failed to send command to terminal.'
            }))
            return
          }

          // Poll for output file (command may take varying time)
          let attempts = 0
          const maxAttempts = 30  // 30 * 200ms = 6 seconds max
          const pollInterval = setInterval(() => {
            attempts++

            // Check if exit file exists (command completed)
            if (fs.existsSync(exitFile)) {
              clearInterval(pollInterval)

              let output = ''
              let exitCode = '0'

              try {
                if (fs.existsSync(outputFile)) {
                  output = fs.readFileSync(outputFile, 'utf-8').trim()
                  fs.unlinkSync(outputFile)
                }
                exitCode = fs.readFileSync(exitFile, 'utf-8').trim()
                fs.unlinkSync(exitFile)
              } catch (e) {
                console.error('Error reading output files:', e.message)
              }

              // Truncate if too long
              if (output.length > 10000) {
                output = output.slice(0, 10000) + '\n... (truncated)'
              }

              ws.send(JSON.stringify({
                event: 'mcp:run:response',
                requestId,
                terminalId: actualTerminalId,
                godName: targetGodName,
                exitCode: parseInt(exitCode) || 0,
                output: output || '(No output)'
              }))
              return
            }

            // Timeout after max attempts
            if (attempts >= maxAttempts) {
              clearInterval(pollInterval)

              // Clean up any partial files
              try { fs.unlinkSync(outputFile) } catch {}
              try { fs.unlinkSync(exitFile) } catch {}

              ws.send(JSON.stringify({
                event: 'mcp:run:response',
                requestId,
                terminalId: actualTerminalId,
                godName: targetGodName,
                output: '(Command timed out - may still be running in Iris terminal)'
              }))
            }
          }, 200)
        }, 100)  // 100ms delay after Ctrl+C
      }, initDelay)

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
      const entityTypeInfo = getEntityType(type)
      if (!entityTypeInfo.label || type === 'god' || type === 'terminal') {
        // Use god:spawn or terminal:spawn for those
        break
      }

      const entityId = generateEntityId(type)
      const num = getNextEntityNumber(type)

      appState.entities[entityId] = {
        id: entityId,
        type,
        name: data.name || `${entityTypeInfo.label}-${num}`,
        tabId: appState.activeTabId,
        order: getNextOrder(appState.activeTabId),
        spawnedAt: Date.now(),
        // Type-specific data
        url: data.url || null,
        project: data.project || null,
        data: data.data || null  // Custom data for entity
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

    // Update entity data (for pomodoro, todo, etc.)
    case 'entity:update-data': {
      const entityId = data.entityId
      const entityData = data.data
      if (entityId && appState.entities[entityId]) {
        appState.entities[entityId].data = entityData
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

    case 'stages:reorder': {
      // data.stageOrder: array of stage IDs in new order
      // Stages are sorted by their first entity's order, so we update entity order values
      const { stageOrder } = data
      if (!Array.isArray(stageOrder)) break

      const tab = appState.tabs.find(t => t.id === appState.activeTabId)
      if (!tab?.stages) break

      // For each stage in the new order, find its first entity and update its order
      stageOrder.forEach((stageId, idx) => {
        const stage = tab.stages.find(s => s.id === stageId)
        if (!stage?.layout) return

        // Collect all entity IDs in this stage
        const collectEntityIds = (node) => {
          if (!node) return []
          if (node.type === 'tile') {
            if (node.entityId) return [node.entityId]
            if (node.entityIds?.length) return node.entityIds
            return []
          }
          if (node.type === 'split' && node.children) {
            return node.children.flatMap(child => collectEntityIds(child))
          }
          return []
        }

        const entityIds = collectEntityIds(stage.layout)
        const firstEntityId = entityIds[0]
        if (firstEntityId && appState.entities[firstEntityId]) {
          appState.entities[firstEntityId].order = idx
        }
      })

      saveState()
      broadcastState()
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
          spawnedAt: Date.now(),
          project: projectRoot
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

      const godName = godId || name
      if (!godName) break

      // If there's an existing entity with this name, clean it up first
      const existingEntity = appState.entities[godName]
      const existingTabId = existingEntity?.tabId
      if (existingEntity) {
        if (existingEntity.type === 'god') {
          addToCemetery(existingEntity)
        }
        killPty(godName)
        clearOutputBuffer(godName)
        delete appState.entities[godName]

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
          sessionId: sessionId,
          project: projectRoot
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

    // Markdown viewer management
    case 'md:open': {
      const { filePath, entityId, forceNew } = data
      if (!filePath) break

      // Find or create a markdown entity
      let mdEntity = entityId ? appState.entities[entityId] : null
      let isNewEntity = false

      if (!mdEntity && !forceNew) {
        // Find first markdown entity in active tab
        mdEntity = Object.values(appState.entities).find(
          e => e.type === 'markdown' && e.tabId === appState.activeTabId
        )
      }

      if (!mdEntity) {
        // Create a new markdown entity
        const newId = generateEntityId('markdown')
        const num = getNextEntityNumber('markdown')
        const fileName = path.basename(filePath)

        appState.entities[newId] = {
          id: newId,
          type: 'markdown',
          name: fileName,
          tabId: appState.activeTabId,
          order: getNextOrder(appState.activeTabId),
          spawnedAt: Date.now()
        }
        mdEntity = appState.entities[newId]
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

      // Store pending file in entity
      mdEntity.pendingFile = filePath
      mdEntity.name = path.basename(filePath)

      appState.focusedEntity = mdEntity.id
      saveState()
      broadcastState()

      // For existing entities, broadcast event
      if (!isNewEntity) {
        broadcast('md:file:open', {
          entityId: mdEntity.id,
          filePath
        })
      }
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
        const typeInfo = getEntityType(entityType)

        appState.entities[newId] = {
          id: newId,
          type: entityType,
          name: `${typeInfo.label || entityType}-${num}`,
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

    case 'layout:rearrange': {
      // Alt+drag tile rearrangement: move entity from source tile to target position
      const { tabId, sourceTileId, targetTileId, direction, position, entityId } = data
      const tab = appState.tabs.find(t => t.id === (tabId || appState.activeTabId))
      if (!tab || !entityId) break

      let activeStage = getActiveStage(tab)
      if (!activeStage?.layout) break

      // Don't allow dropping on self
      if (sourceTileId === targetTileId) break

      // Remove entity from its current position in the layout
      activeStage.layout = layout.removeEntityFromLayout(activeStage.layout, entityId)

      // If removing the entity made the layout null (only entity), create fresh layout at target
      if (!activeStage.layout) {
        activeStage.layout = layout.createTile([entityId], entityId)
      } else {
        // Split the target tile and insert the entity
        activeStage.layout = layout.splitTile(activeStage.layout, targetTileId, direction, position, entityId)
      }

      // Focus the new tile and entity
      const newTile = layout.findTileByEntity(activeStage.layout, entityId)
      if (newTile) {
        appState.focusedTile = newTile.id
        appState.focusedEntity = entityId
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
        const typeInfo = getEntityType(entityType)

        appState.entities[newId] = {
          id: newId,
          type: entityType,
          name: `${typeInfo.label || entityType}-${num}`,
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

    // Reorder an entity within its stage (change position in layout)
    case 'stage:reorder-entity': {
      const { stageId, entityId, targetIndex } = data
      if (!stageId || !entityId || targetIndex === undefined) break

      const tab = appState.tabs.find(t => t.id === appState.activeTabId)
      if (!tab) break

      const stage = tab.stages.find(s => s.id === stageId)
      if (!stage?.layout) break

      // Get all entity IDs in this stage's layout
      const entityIds = layout.getAllEntityIds(stage.layout)
      const currentIndex = entityIds.indexOf(entityId)
      if (currentIndex === -1) break

      // Remove from current position and insert at target
      entityIds.splice(currentIndex, 1)
      const insertAt = targetIndex > currentIndex ? targetIndex - 1 : targetIndex
      entityIds.splice(insertAt, 0, entityId)

      // Rebuild the layout with new order
      // For now, just update entity order values to reflect new positions
      entityIds.forEach((id, idx) => {
        if (appState.entities[id]) {
          appState.entities[id].order = idx
        }
      })

      saveState()
      broadcastState()
      break
    }

    // Move entity from one stage to another at a specific position
    case 'stage:join': {
      const { entityId, sourceStageId, targetStageId, targetIndex } = data
      if (!entityId || !sourceStageId || !targetStageId) break

      const tab = appState.tabs.find(t => t.id === appState.activeTabId)
      if (!tab) break

      const sourceStage = tab.stages.find(s => s.id === sourceStageId)
      const targetStage = tab.stages.find(s => s.id === targetStageId)
      if (!sourceStage?.layout || !targetStage?.layout) break

      // Remove entity from source stage
      sourceStage.layout = layout.removeEntityFromLayout(sourceStage.layout, entityId)

      // If source stage is now empty, remove it
      if (!sourceStage.layout) {
        tab.stages = tab.stages.filter(s => s.id !== sourceStage.id)
      }

      // Add entity to target stage's layout
      // For now, add to the first tile and update order
      const targetEntityIds = layout.getAllEntityIds(targetStage.layout)
      const insertAt = Math.min(targetIndex ?? targetEntityIds.length, targetEntityIds.length)

      // Update order values for the target stage entities
      targetEntityIds.forEach((id, idx) => {
        if (appState.entities[id]) {
          // Shift orders to make room for the new entity
          if (idx >= insertAt) {
            appState.entities[id].order = idx + 1
          } else {
            appState.entities[id].order = idx
          }
        }
      })

      // Set the joining entity's order
      if (appState.entities[entityId]) {
        appState.entities[entityId].order = insertAt
      }

      // Add entity to target stage layout (to the first tile for now)
      const firstTile = layout.getFirstTile(targetStage.layout)
      if (firstTile) {
        targetStage.layout = layout.addEntityToTile(targetStage.layout, firstTile.id, entityId)
      }

      // Switch to target stage
      tab.activeStageId = targetStageId
      appState.focusedEntity = entityId

      saveState()
      broadcastState()
      break
    }

    // Create a new solo stage at a specific position (for reordering via drag)
    case 'stage:create-at-position': {
      const { entityId, sourceStageId, position } = data
      if (!entityId || position === undefined) break

      const tab = appState.tabs.find(t => t.id === appState.activeTabId)
      if (!tab) break

      // Find and remove entity from source stage
      const sourceStage = sourceStageId
        ? tab.stages.find(s => s.id === sourceStageId)
        : findStageByEntity(tab, entityId)

      if (sourceStage?.layout) {
        sourceStage.layout = layout.removeEntityFromLayout(sourceStage.layout, entityId)

        // If source stage is now empty, remove it
        if (!sourceStage.layout) {
          tab.stages = tab.stages.filter(s => s.id !== sourceStage.id)
        }
      }

      // Create a new stage for this entity
      const newStageId = generateStageId()
      const tileNode = layout.createTile(entityId)
      const newStage = { id: newStageId, layout: tileNode }

      // Insert at the specified position
      const insertPosition = Math.min(position, tab.stages.length)
      tab.stages.splice(insertPosition, 0, newStage)

      // Update entity order to match stage position
      tab.stages.forEach((stage, idx) => {
        const stageEntityIds = layout.getAllEntityIds(stage.layout)
        stageEntityIds.forEach((id) => {
          if (appState.entities[id]) {
            appState.entities[id].order = idx
          }
        })
      })

      // Switch to the new stage
      tab.activeStageId = newStageId
      appState.focusedTile = tileNode.id
      appState.focusedEntity = entityId

      saveState()
      broadcastState()
      break
    }

    // ==================== PERSONALITIES ====================

    case 'personalities:list': {
      const allPersonalities = personalities.listPersonalities()
      // Add preview for each personality (all are trait-based)
      const personalitiesWithPreview = allPersonalities.map(p => ({
        ...p,
        preview: p.traits.length > 0 ? `Traits: ${p.traits.join(', ')}` : 'No traits enabled'
      }))
      ws.send(JSON.stringify({
        event: 'personalities:list:response',
        personalities: personalitiesWithPreview
      }))
      break
    }

    case 'personalities:get': {
      const { name } = data
      if (!name) {
        ws.send(JSON.stringify({ event: 'personalities:error', error: 'Personality name required' }))
        break
      }

      const loaded = personalities.loadPersonality(name)
      if (!loaded) {
        ws.send(JSON.stringify({ event: 'personalities:error', error: `Personality "${name}" not found` }))
        break
      }

      const info = personalities.getPersonalityInfo(name)

      ws.send(JSON.stringify({
        event: 'personalities:get:response',
        name,
        type: 'traits',
        config: loaded.config,
        source: info?.source || 'unknown'
      }))
      break
    }

    case 'personalities:save': {
      const { name, config } = data
      if (!name) {
        ws.send(JSON.stringify({ event: 'personalities:error', error: 'Personality name required' }))
        break
      }

      if (!config) {
        ws.send(JSON.stringify({ event: 'personalities:error', error: 'Personality config required' }))
        break
      }

      try {
        const savedPath = personalities.savePersonality(name, config)
        ws.send(JSON.stringify({
          event: 'personalities:save:response',
          name,
          path: savedPath,
          source: 'user'
        }))
      } catch (err) {
        ws.send(JSON.stringify({ event: 'personalities:error', error: err.message }))
      }
      break
    }

    case 'personalities:delete': {
      const { name } = data
      if (!name) {
        ws.send(JSON.stringify({ event: 'personalities:error', error: 'Personality name required' }))
        break
      }

      const deleted = personalities.deletePersonality(name)
      if (!deleted) {
        ws.send(JSON.stringify({ event: 'personalities:error', error: `Could not delete personality "${name}"` }))
        break
      }

      ws.send(JSON.stringify({
        event: 'personalities:delete:response',
        name
      }))
      break
    }

    // ==================== TRAITS ====================

    case 'traits:list': {
      const allTraits = traits.listTraits()
      // Add preview for each trait
      const traitsWithPreview = allTraits.map(t => {
        const content = traits.loadTrait(t.name)
        const lines = content ? content.split('\n').filter(l => l.trim()).slice(0, 2) : []
        return {
          ...t,
          preview: lines.join('\n').substring(0, 100)
        }
      })
      ws.send(JSON.stringify({
        event: 'traits:list:response',
        traits: traitsWithPreview
      }))
      break
    }

    case 'traits:get': {
      const { name } = data
      if (!name) {
        ws.send(JSON.stringify({ event: 'traits:error', error: 'Trait name required' }))
        break
      }

      const content = traits.loadTrait(name)
      if (!content) {
        ws.send(JSON.stringify({ event: 'traits:error', error: `Trait "${name}" not found` }))
        break
      }

      const info = traits.getTraitInfo(name)
      ws.send(JSON.stringify({
        event: 'traits:get:response',
        name,
        content,
        source: info?.source || 'unknown'
      }))
      break
    }

    case 'traits:save': {
      const { name, content } = data
      if (!name || content === undefined) {
        ws.send(JSON.stringify({ event: 'traits:error', error: 'Trait name and content required' }))
        break
      }

      try {
        const savedPath = traits.saveTrait(name, content)
        ws.send(JSON.stringify({
          event: 'traits:save:response',
          name,
          path: savedPath,
          source: 'user'
        }))
      } catch (err) {
        ws.send(JSON.stringify({ event: 'traits:error', error: err.message }))
      }
      break
    }

    case 'traits:delete': {
      const { name } = data
      if (!name) {
        ws.send(JSON.stringify({ event: 'traits:error', error: 'Trait name required' }))
        break
      }

      const deleted = traits.deleteTrait(name)
      if (!deleted) {
        ws.send(JSON.stringify({ event: 'traits:error', error: `Could not delete trait "${name}"` }))
        break
      }

      ws.send(JSON.stringify({
        event: 'traits:delete:response',
        name
      }))
      break
    }

    // ==================== MCP SERVERS ====================

    case 'mcp-servers:list': {
      const allServers = mcpServers.listMcpServers()
      ws.send(JSON.stringify({
        event: 'mcp-servers:list:response',
        servers: allServers
      }))
      break
    }

    case 'mcp-servers:get': {
      const { name } = data
      if (!name) {
        ws.send(JSON.stringify({ event: 'mcp-servers:error', error: 'MCP server name required' }))
        break
      }

      const config = mcpServers.loadMcpServer(name)
      if (!config) {
        ws.send(JSON.stringify({ event: 'mcp-servers:error', error: `MCP server "${name}" not found` }))
        break
      }

      const info = mcpServers.getMcpServerInfo(name)
      ws.send(JSON.stringify({
        event: 'mcp-servers:get:response',
        name,
        config,
        source: info?.source || 'unknown'
      }))
      break
    }

    case 'mcp-servers:save': {
      const { name, config } = data
      if (!name || !config) {
        ws.send(JSON.stringify({ event: 'mcp-servers:error', error: 'MCP server name and config required' }))
        break
      }

      try {
        const savedPath = mcpServers.saveMcpServer(name, config)
        ws.send(JSON.stringify({
          event: 'mcp-servers:save:response',
          name,
          path: savedPath,
          source: 'user'
        }))
      } catch (err) {
        ws.send(JSON.stringify({ event: 'mcp-servers:error', error: err.message }))
      }
      break
    }

    case 'mcp-servers:delete': {
      const { name } = data
      if (!name) {
        ws.send(JSON.stringify({ event: 'mcp-servers:error', error: 'MCP server name required' }))
        break
      }

      const deleted = mcpServers.deleteMcpServer(name)
      if (!deleted) {
        ws.send(JSON.stringify({ event: 'mcp-servers:error', error: `Could not delete MCP server "${name}"` }))
        break
      }

      ws.send(JSON.stringify({
        event: 'mcp-servers:delete:response',
        name
      }))
      break
    }

    // ==================== PROJECTS ====================

    case 'projects:list': {
      const allProjects = projects.listProjects()
      ws.send(JSON.stringify({
        event: 'projects:list:response',
        projects: allProjects
      }))
      break
    }

    case 'projects:get': {
      const { name } = data
      if (!name) {
        ws.send(JSON.stringify({ event: 'projects:error', error: 'Project name required' }))
        break
      }

      const project = projects.loadProject(name)
      if (!project) {
        ws.send(JSON.stringify({ event: 'projects:error', error: `Project "${name}" not found` }))
        break
      }

      ws.send(JSON.stringify({
        event: 'projects:get:response',
        name,
        ...project
      }))
      break
    }

    case 'projects:save': {
      const { name, path: projectPath, description, isDefault } = data
      if (!name) {
        ws.send(JSON.stringify({ event: 'projects:error', error: 'Project name required' }))
        break
      }

      if (!projectPath) {
        ws.send(JSON.stringify({ event: 'projects:error', error: 'Project path required' }))
        break
      }

      try {
        const config = {
          path: projectPath,
          description: description || '',
          isDefault: isDefault || false
        }
        const savedPath = projects.saveProject(name, config)
        ws.send(JSON.stringify({
          event: 'projects:save:response',
          name,
          path: savedPath
        }))
      } catch (err) {
        ws.send(JSON.stringify({ event: 'projects:error', error: err.message }))
      }
      break
    }

    case 'projects:delete': {
      const { name } = data
      if (!name) {
        ws.send(JSON.stringify({ event: 'projects:error', error: 'Project name required' }))
        break
      }

      const deleted = projects.deleteProject(name)
      if (!deleted) {
        ws.send(JSON.stringify({ event: 'projects:error', error: `Could not delete project "${name}"` }))
        break
      }

      ws.send(JSON.stringify({
        event: 'projects:delete:response',
        name
      }))
      break
    }

    case 'projects:setDefault': {
      const { name } = data
      if (!name) {
        ws.send(JSON.stringify({ event: 'projects:error', error: 'Project name required' }))
        break
      }

      projects.setDefaultProject(name)
      ws.send(JSON.stringify({
        event: 'projects:setDefault:response',
        name
      }))
      break
    }

    // ==================== FILE OPERATIONS (WebSocket) ====================

    case 'file:list': {
      const { id } = msg
      const dirPath = data.path || process.env.HOME
      const showHidden = data.showHidden || false
      const maxDepth = data.maxDepth || 3

      readDirectoryTree(dirPath, maxDepth, 0, showHidden).then(tree => {
        ws.send(JSON.stringify({ id, event: 'file:list', ok: true, tree }))
      }).catch(err => {
        ws.send(JSON.stringify({ id, event: 'file:list', ok: false, error: err.message }))
      })
      break
    }

    case 'file:children': {
      const { id } = msg
      const dirPath = data.path
      const showHidden = data.showHidden || false

      if (!dirPath) {
        ws.send(JSON.stringify({ id, event: 'file:children', ok: false, error: 'Missing path parameter' }))
        break
      }

      fs.promises.stat(dirPath).then(async stats => {
        if (!stats.isDirectory()) {
          ws.send(JSON.stringify({ id, event: 'file:children', ok: false, error: 'Path is not a directory' }))
          return
        }

        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
        entries.sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1
          if (!a.isDirectory() && b.isDirectory()) return 1
          return a.name.localeCompare(b.name)
        })

        const filtered = entries.filter(e => {
          if (['node_modules', '__pycache__', 'dist', 'build'].includes(e.name)) return false
          if (!showHidden && e.name.startsWith('.')) return false
          return true
        })

        const children = filtered.map(entry => ({
          name: entry.name,
          path: path.join(dirPath, entry.name),
          type: entry.isDirectory() ? 'directory' : 'file',
          children: entry.isDirectory() ? [] : undefined
        }))

        ws.send(JSON.stringify({ id, event: 'file:children', ok: true, children }))
      }).catch(err => {
        ws.send(JSON.stringify({ id, event: 'file:children', ok: false, error: err.message }))
      })
      break
    }

    case 'file:read': {
      const { id } = msg
      const filePath = data.path

      if (!filePath) {
        ws.send(JSON.stringify({ id, event: 'file:read', ok: false, error: 'Missing path parameter' }))
        break
      }

      fs.promises.readFile(filePath, 'utf-8').then(content => {
        ws.send(JSON.stringify({ id, event: 'file:read', ok: true, content }))
      }).catch(err => {
        ws.send(JSON.stringify({ id, event: 'file:read', ok: false, error: err.message }))
      })
      break
    }

    case 'file:write': {
      const { id } = msg
      const filePath = data.path
      const content = data.content

      if (!filePath || content === undefined) {
        ws.send(JSON.stringify({ id, event: 'file:write', ok: false, error: 'Missing path or content' }))
        break
      }

      fs.promises.writeFile(filePath, content, 'utf-8').then(() => {
        ws.send(JSON.stringify({ id, event: 'file:write', ok: true }))
      }).catch(err => {
        ws.send(JSON.stringify({ id, event: 'file:write', ok: false, error: err.message }))
      })
      break
    }

    // Forward other events to all clients
    default:
      broadcast(event, data)
  }
}

// Helper: Read directory tree recursively
async function readDirectoryTree(dirPath, maxDepth = 3, currentDepth = 0, showHidden = false) {
  const stats = await fs.promises.stat(dirPath)
  const name = path.basename(dirPath)

  if (!stats.isDirectory()) {
    return { name, path: dirPath, type: 'file' }
  }

  const node = { name, path: dirPath, type: 'directory', children: [] }

  if (currentDepth >= maxDepth) return node

  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1
      if (!a.isDirectory() && b.isDirectory()) return 1
      return a.name.localeCompare(b.name)
    })

    const filtered = entries.filter(e => {
      if (['node_modules', '__pycache__', 'dist', 'build'].includes(e.name)) return false
      if (!showHidden && e.name.startsWith('.')) return false
      return true
    })

    for (const entry of filtered) {
      const childPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        node.children.push(await readDirectoryTree(childPath, maxDepth, currentDepth + 1, showHidden))
      } else {
        node.children.push({ name: entry.name, path: childPath, type: 'file' })
      }
    }
  } catch (err) {
    console.error('Error reading directory:', err)
  }

  return node
}
