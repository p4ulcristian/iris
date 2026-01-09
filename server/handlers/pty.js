/**
 * PTY and service management handlers.
 */

import { execSync } from 'child_process'
import fs from 'fs'
import { SERVICES, ZELLIJ_BIN, ZELLIJ_CONFIG_DIR } from '../config.js'
import {
  appState, saveState, broadcastState,
  generateStageId, getNextOrder
} from '../state.js'
import { startService, stopService, startChronicle, stopChronicle } from '../services.js'
import { createTerminalSession } from '../gods.js'
import { getSessionName } from '../gods.js'
import { attachPty, detachPty, sendToPty, resizePty, clearOutputBuffer } from '../pty.js'
import * as layout from '../layout.js'

export const handlers = {
  'service:start': (ws, data, projectRoot) => {
    const service = data.service
    console.log('[service:start] Received:', { service, projectRoot, hasService: !!SERVICES[service] })
    if (service === 'chronicle') {
      // Chronicle is a mode within hear, not a separate service
      startChronicle()
    } else if (service && SERVICES[service]) {
      console.log('[service:start] Starting service:', service)
      startService(service, projectRoot)
    } else {
      console.log('[service:start] Unknown service or missing config:', service)
    }
  },

  'service:stop': (ws, data) => {
    const service = data.service
    console.log('[service:stop] Received:', { service })
    if (service === 'chronicle') {
      stopChronicle()
    } else if (service && SERVICES[service]) {
      stopService(service)
    }
  },

  // MCP Integration - run commands in god terminals
  'mcp:run': (ws, data, projectRoot) => {
    const { requestId, godName, terminalName, command } = data
    if (!requestId || !command) {
      ws.send(JSON.stringify({
        event: 'mcp:run:response',
        requestId,
        error: 'Missing requestId or command'
      }))
      return
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
    const outputFile = `/tmp/iris-mcp-${requestId}.out`
    const exitFile = `/tmp/iris-mcp-${requestId}.exit`

    // Helper to send command to zellij using byte values
    const sendToZellij = (cmd) => {
      try {
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
    // New terminals need ~3s for Zellij + shell to fully initialize
    const initDelay = terminal ? 100 : 3000
    setTimeout(() => {
      // First send Ctrl+C to clear any stuck input
      try {
        execSync(`"${ZELLIJ_BIN}" --config-dir "${ZELLIJ_CONFIG_DIR}" -s "${sessionName}" action write 3`, {
          timeout: 1000,
          stdio: 'pipe'
        })
      } catch {}

      // Small delay after Ctrl+C
      setTimeout(() => {
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

        // Poll for output file (150 attempts * 200ms = 30s max)
        let attempts = 0
        const maxAttempts = 150
        const pollInterval = setInterval(() => {
          attempts++

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

          if (attempts >= maxAttempts) {
            clearInterval(pollInterval)

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
      }, 100)
    }, initDelay)
  },

  // PTY management
  'pty:attach': (ws, data) => {
    attachPty(data.godName, ws, data.cols, data.rows)
  },

  'pty:detach': (ws, data) => {
    detachPty(data.godName, ws)
  },

  'pty:input': (ws, data) => {
    const entityId = data.entityId || data.godName
    // Reset readyState when user types to an entity
    if (appState.entities[entityId]?.readyState &&
        appState.entities[entityId].readyState !== 'working') {
      appState.entities[entityId].readyState = 'working'
      saveState()
      broadcastState()
    }
    sendToPty(entityId, data.data)
  },

  'pty:resize': (ws, data) => {
    resizePty(data.godName, data.cols, data.rows)
  },
}
