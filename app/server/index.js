import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { WebSocketServer } from 'ws'

import { WS_PORT, SOCKET_DIR } from './config.js'
import { setBroadcast as setStateBroadcast, loadState, getStateForBroadcast } from './state.js'
import { setBroadcast as setServicesBroadcast, serviceStatus, startHealthChecks, stopHealthChecks } from './services.js'
import { detachAllFromClient, killAllPty } from './pty.js'
import { handleMessage } from './handlers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, '../..')

// Ensure socket directory exists
if (!fs.existsSync(SOCKET_DIR)) {
  fs.mkdirSync(SOCKET_DIR, { recursive: true })
}

// WebSocket clients
const wsClients = new Set()

import { appendFileSync } from 'fs'
const DEBUG_LOG = '/tmp/iris-debug.log'
function debugLog(msg) {
  appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${msg}\n`)
}

// Broadcast function
function broadcast(event, data = {}) {
  const msg = JSON.stringify({ event, ...data })
  debugLog(`broadcast ${event} to ${wsClients.size} clients`)
  wsClients.forEach(ws => {
    if (ws.readyState === 1) {
      ws.send(msg)
    } else {
      debugLog(`  - skipped client in state ${ws.readyState}`)
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
      debugLog(`Received from client: ${msg.event}`)
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
  process.exit(0)
}
