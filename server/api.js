/**
 * HTTP API for Claude Code hooks and external integrations.
 *
 * This allows hooks to use curl instead of Python skills or CLI binaries.
 *
 * Endpoints:
 *   POST /api/ready  - Set god ready state
 *   POST /api/title  - Set god title
 *   POST /api/status - Set god status
 *   POST /api/hook   - Handle PostToolUse hooks
 *   POST /api/say    - Speak text via TTS
 */

import { appState, saveState, broadcastState } from './state.js'
import { getOutputBuffer, getZellijScrollback, getRunBuffer, getRunStatus } from './pty.js'
import { allHandlers as handlers } from './handlers/index.js'

// Parse JSON body from request
function parseJson(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        resolve(JSON.parse(body))
      } catch {
        resolve({})
      }
    })
  })
}

// Format tool status from hook data
function formatToolStatus(toolName, toolInput, cwd) {
  if (!toolName) return null

  // Shorten paths by removing cwd prefix
  const shortenPath = (path) => {
    if (!path || !cwd) return path
    if (path.startsWith(cwd)) {
      return path.slice(cwd.length).replace(/^\//, '') || '.'
    }
    return path
  }

  switch (toolName) {
    case 'Read':
      return `Reading ${shortenPath(toolInput?.file_path)}`
    case 'Write':
      return `Writing ${shortenPath(toolInput?.file_path)}`
    case 'Edit':
      return `Editing ${shortenPath(toolInput?.file_path)}`
    case 'Bash':
      const cmd = toolInput?.command || ''
      return `Running ${cmd.slice(0, 50)}${cmd.length > 50 ? '...' : ''}`
    case 'Grep':
      return `Searching for ${toolInput?.pattern}`
    case 'Glob':
      return `Finding ${toolInput?.pattern}`
    case 'WebFetch':
      return `Fetching ${toolInput?.url}`
    case 'WebSearch':
      return `Searching "${toolInput?.query}"`
    case 'Task':
      return `Task: ${toolInput?.description || toolInput?.prompt?.slice(0, 30)}`
    case 'AskUserQuestion':
      return 'Waiting for input...'
    case 'TodoWrite':
      return 'Updating todos'
    default:
      return `${toolName}...`
  }
}

/**
 * Setup HTTP API routes.
 * Returns a handler function that can be used with http.createServer.
 */
export function setupApi() {
  return async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return true
    }

    const url = new URL(req.url, `http://localhost`)

    // POST /api/ready - Set god ready state
    if (req.method === 'POST' && url.pathname === '/api/ready') {
      const { god, state } = await parseJson(req)
      if (god && state) {
        const entity = Object.values(appState.entities).find(e => e.name === god || e.id === god)
        if (entity) {
          entity.readyState = state
          saveState()
          broadcastState()
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return true
    }

    // POST /api/title - Set god title
    if (req.method === 'POST' && url.pathname === '/api/title') {
      const { god, title } = await parseJson(req)
      if (god && title) {
        const entity = Object.values(appState.entities).find(e => e.name === god || e.id === god)
        if (entity) {
          entity.title = title
          saveState()
          broadcastState()
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return true
    }

    // POST /api/status - Set god status
    if (req.method === 'POST' && url.pathname === '/api/status') {
      const { god, status } = await parseJson(req)
      if (god && status) {
        const entity = Object.values(appState.entities).find(e => e.name === god || e.id === god)
        if (entity) {
          entity.status = status
          saveState()
          broadcastState()
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return true
    }

    // POST /api/hook - Handle PostToolUse hooks
    if (req.method === 'POST' && url.pathname === '/api/hook') {
      const data = await parseJson(req)
      const { tool_name, tool_input, cwd, god } = data

      if (god) {
        const entity = Object.values(appState.entities).find(e => e.name === god || e.id === god)
        if (entity) {
          // Update status based on tool
          const status = formatToolStatus(tool_name, tool_input, cwd)
          if (status) {
            entity.status = status
          }

          // Update ready state for certain tools
          if (tool_name === 'AskUserQuestion') {
            entity.readyState = 'question'
          } else if (entity.readyState === 'question') {
            entity.readyState = 'working'
          }

          saveState()
          broadcastState()
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return true
    }

    // POST /api/say - Speak text via TTS
    if (req.method === 'POST' && url.pathname === '/api/say') {
      const { text, voice, background } = await parseJson(req)
      if (!text) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Missing text' }))
        return true
      }

      try {
        const payload = { text }
        if (voice) payload.voice = voice

        // Always wait for connection to verify speak server is available
        const response = await fetch('http://127.0.0.1:8765/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })

        if (!response.ok) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Speak server returned error' }))
          return true
        }

        // For background mode, don't wait for response body
        if (background) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        } else {
          // Wait for TTS to complete by consuming response
          await response.text()
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        }
      } catch (e) {
        const isConnectionError = e.cause?.code === 'ECONNREFUSED' || e.message?.includes('ECONNREFUSED')
        const errorMsg = isConnectionError
          ? 'Speak server not available (is brain/speak running?)'
          : e.message
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: errorMsg }))
      }
      return true
    }

    // GET /api/health - Health check
    if (req.method === 'GET' && url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, timestamp: Date.now() }))
      return true
    }

    // POST /api/entities - List all entities
    if (req.method === 'POST' && url.pathname === '/api/entities') {
      const entities = Object.values(appState.entities).map(e => ({
        id: e.id,
        name: e.name,
        type: e.type,
        readyState: e.readyState,
        title: e.title,
        status: e.status
      }))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ entities }))
      return true
    }

    // POST /api/peek - Get god's terminal output
    if (req.method === 'POST' && url.pathname === '/api/peek') {
      const { god, lines = 50 } = await parseJson(req)
      if (!god) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing god name' }))
        return true
      }

      try {
        const output = getOutputBuffer(god, lines)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ output: output || '' }))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
      return true
    }

    // POST /api/peek-terminal - Get terminal's output
    if (req.method === 'POST' && url.pathname === '/api/peek-terminal') {
      const { terminal, lines = 50 } = await parseJson(req)
      if (!terminal) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing terminal name' }))
        return true
      }
      try {
        // Find terminal entity by display name
        const entity = Object.values(appState.entities).find(
          e => e.type === 'terminal' && e.name === terminal
        )
        if (!entity) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: `Terminal "${terminal}" not found` }))
          return true
        }
        // Use entity.id as buffer key (sanitized name like "Terminal-1")
        // Fall back to Zellij scrollback if buffer is empty
        let output = getOutputBuffer(entity.id, lines)
        if (!output) {
          const scrollback = getZellijScrollback(entity.id)
          if (scrollback) {
            const allLines = scrollback.split('\n')
            const startIdx = Math.max(0, allLines.length - lines)
            output = allLines.slice(startIdx).join('\n')
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ output: output || '' }))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
      return true
    }

    // POST /api/peek-run - Get output for a specific command run
    if (req.method === 'POST' && url.pathname === '/api/peek-run') {
      const { run_id, lines } = await parseJson(req)
      if (!run_id) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing run_id' }))
        return true
      }

      const output = getRunBuffer(run_id, lines)
      const status = getRunStatus(run_id)

      if (output === null) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: `Run "${run_id}" not found` }))
        return true
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ output, status }))
      return true
    }

    // POST /api/spawn - Spawn a new god (delegates to handler)
    if (req.method === 'POST' && url.pathname === '/api/spawn') {
      const data = await parseJson(req)

      // Create a mock WebSocket that captures the response
      let response = null
      const mockWs = {
        send: (msg) => {
          try {
            response = JSON.parse(msg)
          } catch {}
        }
      }

      try {
        // Call the god:spawn handler
        handlers['god:spawn'](mockWs, data, process.cwd())

        // Wait a moment for async spawn
        await new Promise(r => setTimeout(r, 100))

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(response || { ok: true, name: data.name }))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
      return true
    }

    // POST /api/push - Send input to god's terminal
    if (req.method === 'POST' && url.pathname === '/api/push') {
      const { god, text } = await parseJson(req)
      if (!god || !text) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing god or text' }))
        return true
      }

      try {
        // Import sendToPty dynamically
        const { sendToPty } = await import('./pty.js')
        sendToPty(god, text + '\r')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
      return true
    }

    // POST /api/push-terminal - Send input to terminal
    if (req.method === 'POST' && url.pathname === '/api/push-terminal') {
      const { terminal, text } = await parseJson(req)
      if (!terminal || !text) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing terminal or text' }))
        return true
      }

      try {
        // Find terminal entity by display name
        const entity = Object.values(appState.entities).find(
          e => e.type === 'terminal' && e.name === terminal
        )
        if (!entity) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: `Terminal "${terminal}" not found` }))
          return true
        }
        const { sendToPty } = await import('./pty.js')
        sendToPty(entity.id, text + '\r')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
      return true
    }

    // POST /api/run - Run command in terminal (uses mcp:run handler)
    // Options: god (terminal owner), command, raw (clean output mode)
    if (req.method === 'POST' && url.pathname === '/api/run') {
      const { god, command, raw } = await parseJson(req)
      if (!command) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing command' }))
        return true
      }

      // Create a mock WebSocket to capture response
      const requestId = `api-${Date.now()}`
      let response = null
      const mockWs = {
        send: (msg) => {
          try {
            const parsed = JSON.parse(msg)
            if (parsed.event === 'mcp:run:response' && parsed.requestId === requestId) {
              response = parsed
            }
          } catch {}
        }
      }

      try {
        handlers['mcp:run'](mockWs, {
          requestId,
          godName: god || 'Hermes',
          command,
          raw: !!raw
        }, process.cwd())

        // Wait for response (up to 35s for command timeout + buffer)
        let waited = 0
        while (!response && waited < 35000) {
          await new Promise(r => setTimeout(r, 100))
          waited += 100
        }

        if (response) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            ok: true,
            runId: response.runId,
            output: response.output,
            exitCode: response.exitCode,
            status: response.status,
            hint: response.hint
          }))
        } else {
          res.writeHead(504, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Command timed out', runId: requestId }))
        }
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
      return true
    }

    // POST /api/browse - Open URL in browser entity
    if (req.method === 'POST' && url.pathname === '/api/browse') {
      const { url: targetUrl, god_name } = await parseJson(req)
      if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing url' }))
        return true
      }

      // Create mock WebSocket
      const mockWs = { send: () => {} }

      try {
        handlers['entity:spawn'](mockWs, {
          type: 'browser',
          url: targetUrl,
          relativeToEntity: god_name || null
        }, process.cwd())

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, url: targetUrl }))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
      return true
    }

    // POST /api/code - Open file in code viewer (with optional diff mode)
    if (req.method === 'POST' && url.pathname === '/api/code') {
      const { path: filePath, line, project, diff, god_name } = await parseJson(req)
      if (!filePath) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing path' }))
        return true
      }

      try {
        // Use code:open handler which properly sets pendingFile
        handlers['code:open'](null, {
          filePath,
          line: line || 1,
          diff: diff || false,
          relativeToEntity: god_name || null
        })

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, path: filePath }))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
      return true
    }

    // POST /api/md - Open markdown in viewer
    if (req.method === 'POST' && url.pathname === '/api/md') {
      const { path: filePath, god_name } = await parseJson(req)
      if (!filePath) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing path' }))
        return true
      }

      const mockWs = { send: () => {} }

      try {
        // Use md:open handler which properly sets pendingFile
        handlers['md:open'](mockWs, { filePath, relativeToEntity: god_name || null }, process.cwd())

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, path: filePath }))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
      return true
    }

    // POST /api/code/highlight - Add highlights to code viewer
    if (req.method === 'POST' && url.pathname === '/api/code/highlight') {
      const { path: filePath, highlights } = await parseJson(req)
      if (!filePath || !highlights) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing path or highlights' }))
        return true
      }

      try {
        handlers['code:highlight'](null, { filePath, highlights })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
      return true
    }

    // POST /api/code/clear - Clear highlights
    if (req.method === 'POST' && url.pathname === '/api/code/clear') {
      const { path: filePath } = await parseJson(req)

      try {
        handlers['code:highlight:clear'](null, { filePath })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
      return true
    }

    // POST /api/code/diff - Show diff in code viewer
    if (req.method === 'POST' && url.pathname === '/api/code/diff') {
      const { path: filePath, original, modified } = await parseJson(req)
      if (!filePath || original === undefined || modified === undefined) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing path, original, or modified' }))
        return true
      }

      try {
        handlers['code:diff'](null, { filePath, original, modified })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
      return true
    }

    // POST /debug-wheel - Log wheel events for debugging
    if (req.method === 'POST' && url.pathname === '/debug-wheel') {
      const data = await parseJson(req)
      const fs = await import('fs')
      const logLine = `${new Date().toISOString()} ${JSON.stringify(data)}\n`
      fs.appendFileSync('/tmp/iris-wheel-debug.log', logLine)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return true
    }

    // Not handled by API
    return false
  }
}
