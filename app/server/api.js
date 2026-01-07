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

        if (background) {
          // Fire and forget for background mode
          fetch('http://127.0.0.1:8765/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).catch(() => {})
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        } else {
          // Wait for TTS to complete
          const response = await fetch('http://127.0.0.1:8765/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
          res.writeHead(response.ok ? 200 : 500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: response.ok }))
        }
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
      return true
    }

    // GET /api/health - Health check
    if (req.method === 'GET' && url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, timestamp: Date.now() }))
      return true
    }

    // Not handled by API
    return false
  }
}
