import fs from 'fs'
import path from 'path'
import http from 'http'
import { fileURLToPath } from 'url'
import { WebSocketServer } from 'ws'

import { WS_PORT, SOCKET_DIR, OAUTH_PORT } from './config.js'
import { setBroadcast as setStateBroadcast, loadState, getStateForBroadcast, broadcastState } from './state.js'
import { setBroadcast as setServicesBroadcast, serviceStatus, startHealthChecks, stopHealthChecks } from './services.js'
import { detachAllFromClient, killAllPty } from './pty.js'
import { handleMessage } from './handlers.js'
import * as calendar from './calendar.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, '../..')

// Ensure socket directory exists
if (!fs.existsSync(SOCKET_DIR)) {
  fs.mkdirSync(SOCKET_DIR, { recursive: true })
}

// WebSocket clients
const wsClients = new Set()

// Broadcast function
function broadcast(event, data = {}) {
  const msg = JSON.stringify({ event, ...data })
  wsClients.forEach(ws => {
    if (ws.readyState === 1) {
      ws.send(msg)
    }
  })
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

// OAuth callback HTTP server
const oauthServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${OAUTH_PORT}`)

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

function cleanup() {
  console.log('Shutting down server...')
  stopHealthChecks()
  killAllPty()
  wss.close()
  oauthServer.close()
  process.exit(0)
}
