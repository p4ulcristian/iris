/**
 * PTY and service management handlers.
 */

import { execSync } from 'child_process'
import fs from 'fs'
import { SERVICES, ZELLIJ_BIN, ZELLIJ_CONFIG_DIR } from '../config.js'
import {
  appState, saveState, broadcastState,
  getNextOrder
} from '../state.js'
import { startService, stopService, startChronicle, stopChronicle } from '../services.js'
import { createTerminalSession } from '../gods.js'
import { getSessionName } from '../gods.js'
import { attachPty, detachPty, sendToPty, resizePty, clearOutputBuffer, getOutputBuffer, getZellijScrollback } from '../pty.js'
import { splitIntoTile } from '../../entities/_shared/spawn.js'

// Extract readable command title from shell command
function getCommandTitle(command) {
  const cleaned = command.trim()
  const parts = cleaned.split(/\s+/).slice(0, 3)
  const title = parts.join(' ')
  return title.length > 40 ? title.slice(0, 37) + '...' : title
}

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

  // MCP Integration - run commands in god terminals
  'mcp:run': (ws, data, projectRoot) => {
    const { requestId, godName, terminalName, command, raw } = data
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

        // Split focused tile to place terminal beside current entity
        splitIntoTile(actualTerminalId, appState.activeTabId, { direction: 'horizontal' })

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
        return false
      }
    }

    // Wait a bit for new terminals to initialize, then send command
    // New terminals need ~3s for Zellij + shell to fully initialize
    const initDelay = terminal ? 100 : 3000
    setTimeout(() => {
      // Send Ctrl+C to clear any stuck input (skip in raw mode for cleaner output)
      if (!raw) {
        try {
          execSync(`"${ZELLIJ_BIN}" --config-dir "${ZELLIJ_CONFIG_DIR}" -s "${sessionName}" action write 3`, {
            timeout: 1000,
            stdio: 'pipe'
          })
        } catch {}
      }

      // Small delay before command
      setTimeout(() => {
        // Raw mode: clean terminal output with markers for parsing
        // Wrapped mode: captures stdout/stderr to file (uglier but more reliable)
        const startMarker = `__IRIS_START_${requestId}__`
        const endMarker = `__IRIS_END_${requestId}__`
        const actualCommand = raw
          ? `echo ${startMarker}; ${command}; echo ${endMarker}; echo $? > "${exitFile}"`
          : `( ${command} ) > "${outputFile}" 2>&1; cat "${outputFile}"; echo $? > "${exitFile}"`

        const success = sendToZellij(actualCommand)

        // Update terminal title with the command
        if (success && appState.entities[actualTerminalId]) {
          appState.entities[actualTerminalId].title = getCommandTitle(command)
          saveState()
          broadcastState()
        }

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

        // Watch for exit file using fs.watchFile (more efficient than polling)
        const timeout = setTimeout(() => {
          fs.unwatchFile(exitFile)
          try { fs.unlinkSync(outputFile) } catch {}
          try { fs.unlinkSync(exitFile) } catch {}

          ws.send(JSON.stringify({
            event: 'mcp:run:response',
            requestId,
            terminalId: actualTerminalId,
            godName: targetGodName,
            output: '(Command timed out - may still be running in Iris terminal)'
          }))
        }, 30000) // 30s timeout

        const handleFileChange = (curr) => {
          // File exists when size > 0
          if (curr.size > 0) {
            clearTimeout(timeout)
            fs.unwatchFile(exitFile)

            // Small delay to let buffer flush before reading
            const readDelay = raw ? 500 : 0
            setTimeout(() => {
              let output = ''
              let exitCode = '0'

              try {
                exitCode = fs.readFileSync(exitFile, 'utf-8').trim()
                fs.unlinkSync(exitFile)

                if (raw) {
                  // Raw mode: parse output between markers from Zellij scrollback
                  const buffer = getZellijScrollback(actualTerminalId) || ''
                  const startIdx = buffer.indexOf('\n' + startMarker)
                  const endIdx = buffer.indexOf('\n' + endMarker)
                  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
                    const content = buffer.slice(startIdx + 1 + startMarker.length, endIdx)
                    output = content.trim()
                  } else {
                    output = '(Could not parse output)'
                  }
                } else {
                  // Wrapped mode: read from output file
                  if (fs.existsSync(outputFile)) {
                    output = fs.readFileSync(outputFile, 'utf-8').trim()
                    fs.unlinkSync(outputFile)
                  }
                }
              } catch (e) {
                // Error reading output
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
            }, readDelay)
          }
        }

        // Watch with 500ms poll interval (more efficient than 200ms)
        fs.watchFile(exitFile, { interval: 500 }, handleFileChange)
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
