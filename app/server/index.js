import fs from 'fs'
import path from 'path'
import http from 'http'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import { WebSocketServer } from 'ws'

import { WS_PORT, SOCKET_DIR, OAUTH_PORT } from './config.js'
import { setBroadcast as setStateBroadcast, loadState, getStateForBroadcast, broadcastState } from './state.js'
import { setBroadcast as setServicesBroadcast, serviceStatus, startHealthChecks, stopHealthChecks } from './services.js'
import { detachAllFromClient, killAllPty } from './pty.js'
import { handleMessage } from './handlers.js'
import * as calendar from './calendar.js'
import { ABDUCO_PATH } from './gods.js'

import os from 'os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// In dev: use iris project root. In production: use home directory
const isDev = process.env.NODE_ENV === 'development' || __dirname.includes('server')
const projectRoot = isDev ? path.join(__dirname, '../..') : os.homedir()

// Check for abduco (bundled or system)
let abducoMissing = false
try {
  execSync(`"${ABDUCO_PATH}" -v`, { stdio: 'ignore' })
  console.log(`Using abduco: ${ABDUCO_PATH}`)
} catch {
  abducoMissing = true
  const isMac = process.platform === 'darwin'
  console.warn('⚠️  abduco not found - terminal sessions will not work')
  console.warn(isMac ? '   Install with: brew install abduco' : '   Install with: sudo pacman -S abduco')
}

// Ensure socket directory exists
if (!fs.existsSync(SOCKET_DIR)) {
  fs.mkdirSync(SOCKET_DIR, { recursive: true })
}

// WebSocket clients
const wsClients = new Set()

// Broadcast function
function broadcast(event, data = {}) {
  const msg = JSON.stringify({ event, ...data })
  console.log(`[broadcast] ${event} to ${wsClients.size} clients`)
  let sent = 0
  wsClients.forEach(ws => {
    if (ws.readyState === 1) {
      ws.send(msg)
      sent++
    }
  })
  console.log(`[broadcast] Sent to ${sent}/${wsClients.size} clients`)
}

// Wire up broadcast to state and services modules
setStateBroadcast(broadcast)
setServicesBroadcast(broadcast)

// Load persisted state
loadState()

// Create WebSocket server
const wss = new WebSocketServer({ port: WS_PORT })

wss.on('connection', (ws) => {
  wsClients.add(ws)
  console.log(`Client connected (${wsClients.size} total)`)

  // Send initial state
  const stateData = getStateForBroadcast()
  ws.send(JSON.stringify({
    event: 'state:sync',
    ...stateData,
    services: serviceStatus
  }))

  // Warn if abduco is missing
  if (abducoMissing) {
    const isMac = process.platform === 'darwin'
    ws.send(JSON.stringify({
      event: 'warning',
      message: 'abduco not found - terminal sessions will not work',
      hint: isMac ? 'brew install abduco' : 'sudo pacman -S abduco'
    }))
  }

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString())
      handleMessage(ws, msg, projectRoot)
    } catch (e) {
      console.error('Invalid message:', e)
    }
  })

  ws.on('close', () => {
    wsClients.delete(ws)
    detachAllFromClient(ws)
    console.log(`Client disconnected (${wsClients.size} total)`)
  })
})

console.log(`WebSocket server on :${WS_PORT}`)

// Helper: Read directory tree
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
    // Sort: folders first, then files, alphabetically
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1
      if (!a.isDirectory() && b.isDirectory()) return 1
      return a.name.localeCompare(b.name)
    })

    // Filter common ignores, optionally show hidden files
    const filtered = entries.filter(e => {
      // Always filter out these directories
      if (['node_modules', '__pycache__', 'dist', 'build'].includes(e.name)) return false
      // Filter hidden files unless showHidden is true
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

// HTTP server for OAuth and API
const oauthServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${OAUTH_PORT}`)

  // CORS headers for API
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  // API: Get directory tree
  if (url.pathname === '/api/files') {
    const dirPath = url.searchParams.get('path') || process.env.HOME
    const showHidden = url.searchParams.get('showHidden') === 'true'
    try {
      const tree = await readDirectoryTree(dirPath, 3, 0, showHidden)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(tree))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  // API: Get file content
  if (url.pathname === '/api/file' && req.method === 'GET') {
    const filePath = url.searchParams.get('path')
    if (!filePath) {
      res.writeHead(400, { 'Content-Type': 'text/plain' })
      res.end('Missing path parameter')
      return
    }
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8')
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(content)
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end(err.message)
    }
    return
  }

  // API: Save file content
  if (url.pathname === '/api/file/save' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      try {
        const { path: filePath, content } = JSON.parse(body)
        if (!filePath || content === undefined) {
          res.writeHead(400, { 'Content-Type': 'text/plain' })
          res.end('Missing path or content')
          return
        }
        await fs.promises.writeFile(filePath, content, 'utf-8')
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('OK')
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end(err.message)
      }
    })
    return
  }

  if (url.pathname === '/oauth/google/callback') {
    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html' })
      res.end(`
        <html>
          <body style="font-family: system-ui; padding: 40px; background: #1a1a1a; color: #fff;">
            <h1>Authentication Failed</h1>
            <p>Error: ${error}</p>
            <p>You can close this window.</p>
          </body>
        </html>
      `)
      return
    }

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' })
      res.end(`
        <html>
          <body style="font-family: system-ui; padding: 40px; background: #1a1a1a; color: #fff;">
            <h1>Invalid Request</h1>
            <p>No authorization code provided.</p>
          </body>
        </html>
      `)
      return
    }

    try {
      const result = await calendar.handleAuthCallback(code)
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(`
        <html>
          <body style="font-family: system-ui; padding: 40px; background: #1a1a1a; color: #fff; text-align: center;">
            <h1 style="color: #4ade80;">Connected!</h1>
            <p>Google Calendar connected as <strong>${result.email}</strong></p>
            <p style="color: #888;">You can close this window and return to Iris.</p>
            <script>setTimeout(() => window.close(), 3000)</script>
          </body>
        </html>
      `)
      // Broadcast updated state to all clients
      broadcastState()
    } catch (err) {
      console.error('OAuth callback error:', err)
      res.writeHead(500, { 'Content-Type': 'text/html' })
      res.end(`
        <html>
          <body style="font-family: system-ui; padding: 40px; background: #1a1a1a; color: #fff;">
            <h1 style="color: #f87171;">Authentication Error</h1>
            <p>${err.message}</p>
            <p>You can close this window and try again.</p>
          </body>
        </html>
      `)
    }
    return
  }

  // 404 for other paths
  res.writeHead(404)
  res.end('Not Found')
})

oauthServer.listen(OAUTH_PORT, () => {
  console.log(`OAuth callback server on :${OAUTH_PORT}`)
})

// Start health checks
startHealthChecks()

// Cleanup on exit
process.on('SIGTERM', cleanup)
process.on('SIGINT', cleanup)

// Prevent unhandled errors from crashing the server
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err.message)
  console.error(err.stack)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason)
})

function cleanup() {
  console.log('Shutting down server...')
  stopHealthChecks()
  killAllPty()
  wss.close()
  oauthServer.close()
  process.exit(0)
}
