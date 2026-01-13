import fs from 'fs'
import path from 'path'
import http from 'http'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import { WebSocketServer } from 'ws'

import { WS_PORT, SOCKET_DIR, OAUTH_PORT, ZELLIJ_BIN } from './config.js'
import { setBroadcast as setStateBroadcast, loadState, loadEntityRegistry, getStateForBroadcast, broadcastState } from './state.js'
import { setBroadcast as setServicesBroadcast, serviceStatus, startHealthChecks, stopHealthChecks } from './services.js'
import { setBroadcast as setChronicleBroadcast, startWatcher as startChronicleWatcher, stopWatcher as stopChronicleWatcher } from './chronicle.js'
import { detachAllFromClient, killAllPty, startTitlePolling, stopTitlePolling } from './pty.js'
import { handleMessage } from './handlers/index.js'
import { setupApi } from './api.js'
import * as calendar from './calendar.js'
import { createLogger, clearLog } from './logger.js'

import os from 'os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const log = createLogger('server')

// Clear log on startup
clearLog()

// Kill any stale server processes holding our ports
function cleanupStalePorts() {
  const ports = [WS_PORT, OAUTH_PORT]
  for (const port of ports) {
    try {
      // Find process holding the port (works on Linux and macOS)
      const cmd = process.platform === 'darwin'
        ? `lsof -ti:${port}`
        : `ss -tlnp 2>/dev/null | grep ':${port}' | sed -n 's/.*pid=\\([0-9]*\\).*/\\1/p'`
      const pid = execSync(cmd, { encoding: 'utf-8' }).trim()
      if (pid && pid !== String(process.pid)) {
        log.log(`Killing stale process ${pid} on port ${port}`)
        try {
          process.kill(Number(pid), 'SIGKILL')
        } catch {}
      }
    } catch {
      // No process on port - that's fine
    }
  }
}
cleanupStalePorts()

// In dev: use iris project root. In production: use home directory
const isDev = process.env.NODE_ENV === 'development' || __dirname.includes('server')
const projectRoot = isDev ? path.join(__dirname, '..') : os.homedir()

// Check for zellij
let zellijMissing = false
try {
  execSync(`"${ZELLIJ_BIN}" --version`, { stdio: 'ignore' })
  log.log(`Zellij found: ${ZELLIJ_BIN}`)
} catch {
  zellijMissing = true
  const isMac = process.platform === 'darwin'
  log.warn('zellij not found - terminal sessions will not work')
  log.warn(isMac ? 'brew install zellij' : 'sudo pacman -S zellij')
}

// Ensure socket directory exists
if (!fs.existsSync(SOCKET_DIR)) {
  fs.mkdirSync(SOCKET_DIR, { recursive: true })
}

// WebSocket clients
const wsClients = new Set()

// Broadcast function
const broadcastLog = createLogger('broadcast')
function broadcast(event, data = {}) {
  const msg = JSON.stringify({ event, ...data })
  broadcastLog.log(`${event} to ${wsClients.size} clients`)
  let sent = 0
  wsClients.forEach(ws => {
    if (ws.readyState === 1) {
      ws.send(msg)
      sent++
    }
  })
  broadcastLog.log(`Sent to ${sent}/${wsClients.size} clients`)
}

// Wire up broadcast to state, services, and chronicle modules
setStateBroadcast(broadcast)
setServicesBroadcast(broadcast)
setChronicleBroadcast(broadcast)

// Load persisted state
loadState()

// Load entity registry from app/entities/
loadEntityRegistry().then(() => {
  log.log('Entity registry loaded')
}).catch(err => {
  log.error('Failed to load entity registry:', err)
})

// Create WebSocket server
const wss = new WebSocketServer({ port: WS_PORT })

const wsLog = createLogger('websocket')
wss.on('connection', (ws) => {
  wsClients.add(ws)
  wsLog.log(`Client connected (${wsClients.size} total)`)

  // Send initial state
  const stateData = getStateForBroadcast()
  ws.send(JSON.stringify({
    event: 'state:sync',
    ...stateData,
    services: serviceStatus
  }))

  // Warn if zellij is missing
  if (zellijMissing) {
    const isMac = process.platform === 'darwin'
    ws.send(JSON.stringify({
      event: 'warning',
      message: 'zellij not found - terminal sessions will not work',
      hint: isMac ? 'brew install zellij' : 'sudo pacman -S zellij'
    }))
  }

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString())
      handleMessage(ws, msg, projectRoot)
    } catch (e) {
      wsLog.error('Invalid message:', e)
    }
  })

  ws.on('close', () => {
    wsClients.delete(ws)
    detachAllFromClient(ws)
    wsLog.log(`Client disconnected (${wsClients.size} total)`)
  })
})

log.log(`WebSocket server on :${WS_PORT}`)

// Setup API handler
const apiHandler = setupApi()

// HTTP server for API and OAuth callback
const oauthServer = http.createServer(async (req, res) => {
  // Try API routes first
  const handled = await apiHandler(req, res)
  if (handled) return

  const url = new URL(req.url, `http://localhost:${OAUTH_PORT}`)

  // CORS headers for other routes
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
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
      log.error('OAuth callback error:', err)
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
  log.log(`OAuth callback server on :${OAUTH_PORT}`)
})

// Start health checks, chronicle watcher, and terminal title polling
startHealthChecks()
startChronicleWatcher()
startTitlePolling()

// Cleanup on exit
process.on('SIGTERM', cleanup)
process.on('SIGINT', cleanup)

// Prevent unhandled errors from crashing the server
process.on('uncaughtException', (err) => {
  log.error('Uncaught exception:', err.message)
  log.error(err.stack)
})

process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled rejection at:', promise, 'reason:', reason)
})

function cleanup() {
  log.log('Shutting down server...')
  stopHealthChecks()
  stopChronicleWatcher()
  stopTitlePolling()
  killAllPty()

  // Close WebSocket server and wait for connections to drain
  wss.close(() => {
    log.log('WebSocket server closed')
  })

  // Close OAuth server
  oauthServer.close(() => {
    log.log('OAuth server closed')
  })

  // Give sockets time to close cleanly before exiting
  setTimeout(() => {
    log.log('Cleanup complete, exiting')
    process.exit(0)
  }, 500)
}
