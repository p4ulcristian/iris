/**
 * PTY and service management handlers.
 */

import { execSync } from 'child_process'
import { SERVICES, ZELLIJ_BIN, ZELLIJ_CONFIG_DIR } from '../config.js'
import { appState, saveState, broadcastState, getNextOrder } from '../state.js'
import { startService, stopService, startChronicle, stopChronicle } from '../services.js'
import { createTerminalSession } from '../gods.js'
import { getSessionName } from '../gods.js'
import { attachPty, detachPty, sendToPty, resizePty, clearOutputBuffer, getOutputBuffer, getZellijScrollback, handlePtyInput, createRun, appendToRun, completeRun, isCommandRunning } from '../pty.js'
import { splitIntoTile } from '../../entities/_shared/spawn.js'

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

        // Split to place terminal beside the calling god
        splitIntoTile(actualTerminalId, appState.activeTabId, { 
          direction: 'horizontal',
          relativeToEntity: targetGodName  // Split next to the god who called run_terminal
        })

        appState.focusedEntity = actualTerminalId
        saveState()
        broadcastState()
        terminal = appState.entities[actualTerminalId]
      }
    }

    // Send command directly to Zellij session (bypasses PTY attachment requirement)
    const sessionName = getSessionName(actualTerminalId)

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
      // Create run buffer to track this command's output
      createRun(requestId, actualTerminalId)

      // Send raw command - no markers, no exit file, nothing added
      const success = sendToZellij(command)

      if (!success) {
        completeRun(requestId, 'failed')
        ws.send(JSON.stringify({
          event: 'mcp:run:response',
          requestId,
          runId: requestId,
          terminalId: actualTerminalId,
          godName: targetGodName,
          output: 'Failed to send command to terminal.'
        }))
        return
      }

      // Helper to check if line looks like a shell prompt
      const isPromptLine = (line) => {
        const trimmed = line.trim()
        if (!trimmed) return false
        return trimmed.match(/❯\s*$/) ||
               trimmed.match(/\$\s*$/) ||
               trimmed.match(/>\s*$/) ||
               trimmed.match(/^[^@]*@[^:]*:.*[$#]\s*$/)
      }

      // Helper to parse output from buffer content
      const parseOutput = (newContent) => {
        const lines = newContent.split('\n')

        // Find command line (contains our command text)
        let startIdx = 0
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(command)) {
            startIdx = i + 1
            break
          }
        }

        // Find end (before prompt returns or end of content)
        let endIdx = lines.length
        for (let i = lines.length - 1; i >= startIdx; i--) {
          const line = lines[i]
          if (line.trim() && !isPromptLine(line)) {
            endIdx = i + 1
            break
          }
        }

        return lines.slice(startIdx, endIdx).join('\n').trim()
      }

      // Helper to send output response
      const sendOutput = (status) => {
        const scrollbackAfter = getZellijScrollback(actualTerminalId)
        // Find new content by looking for our command
        let output = parseOutput(scrollbackAfter)

        if (output.length > 10000) {
          output = output.slice(0, 10000) + '\n... (truncated)'
        }

        // Store in run buffer for peek_run
        appendToRun(requestId, output)
        completeRun(requestId, status)

        ws.send(JSON.stringify({
          event: 'mcp:run:response',
          requestId,
          runId: requestId,
          terminalId: actualTerminalId,
          godName: targetGodName,
          status,
          output: output || '(No output)',
          ...(status === 'running' && {
            hint: `Command still running. Use peek_run("${requestId}") for more output.`
          })
        }))
      }

      // Brief delay for command to start, then poll for completion
      setTimeout(() => {
        const POLL_INTERVAL = 200
        const INITIAL_TIMEOUT = 30000

        const pollInterval = setInterval(() => {
          const running = isCommandRunning(sessionName)
          if (!running) {
            // Command finished
            clearInterval(pollInterval)
            clearTimeout(timeoutTimer)
            // Small delay to let buffer flush
            setTimeout(() => sendOutput('completed'), 300)
          }
        }, POLL_INTERVAL)

        const timeoutTimer = setTimeout(() => {
          clearInterval(pollInterval)
          // Still running - return partial output
          sendOutput('running')
        }, INITIAL_TIMEOUT)
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
    const godName = data.entityId || data.godName
    // Find entity - try direct lookup, then by name (handles displayName vs ID mismatch)
    const entity = appState.entities[godName] ||
      Object.values(appState.entities).find(e => e.name === godName)

    // Reset readyState when user types to an entity
    if (entity?.readyState && entity.readyState !== 'working') {
      entity.readyState = 'working'
      saveState()
      broadcastState()
    }
    // Capture commands for terminal entities (standalone terminals, not gods)
    if (entity?.type === 'terminal') {
      handlePtyInput(entity.id, data.data)
    }
    // Use original godName for PTY (it's what the PTY is registered under)
    sendToPty(godName, data.data)
  },

  'pty:resize': (ws, data) => {
    resizePty(data.godName, data.cols, data.rows)
  },
}
