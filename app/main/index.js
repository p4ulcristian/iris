import { app, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import http from 'http'
import { fileURLToPath } from 'url'
import { WebSocketServer } from 'ws'
import { execSync, spawn } from 'child_process'
import pty from 'node-pty'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const WS_PORT = 9999
const SOCKET_DIR = path.join(os.homedir(), '.local/share/iris/sockets')
const STATE_FILE = path.join(os.homedir(), '.local/share/iris/state.json')

// Ensure socket directory exists
if (!fs.existsSync(SOCKET_DIR)) {
  fs.mkdirSync(SOCKET_DIR, { recursive: true })
}

// --- APP STATE (source of truth) ---

let appState = {
  version: 1,
  tabs: [{ id: 1, name: 'Main' }],
  activeTabId: 1,
  tabCounter: 1,
  gods: {},  // { godName: { tabId, order } }
  theme: 'divine-void',  // Current theme ID
  viewMode: 'grid',  // 'grid' | 'focus'
  focusedGod: null   // Which god is focused (used in focus mode)
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))
      appState = { ...appState, ...data }
    }
  } catch (e) {
    console.error('Failed to load state:', e)
  }

  // Merge with discovered sockets
  const sockets = listGodSockets()
  const socketNames = new Set(sockets.map(s => s.name))

  // Remove gods without sockets
  Object.keys(appState.gods).forEach(name => {
    if (!socketNames.has(name)) delete appState.gods[name]
  })

  // Add new sockets to Main tab
  sockets.forEach(sock => {
    if (!appState.gods[sock.name]) {
      const godsInMain = Object.values(appState.gods).filter(g => g.tabId === 1)
      appState.gods[sock.name] = { tabId: 1, order: godsInMain.length }
    }
  })

  saveState()
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(appState, null, 2))
  } catch (e) {
    console.error('Failed to save state:', e)
  }
}

function getStateForBroadcast() {
  const gods = listGodSockets().map(sock => ({
    ...sock,
    tabId: appState.gods[sock.name]?.tabId || 1,
    order: appState.gods[sock.name]?.order || 0
  }))

  // Sort gods by order within each tab
  gods.sort((a, b) => a.order - b.order)

  return {
    tabs: appState.tabs,
    activeTabId: appState.activeTabId,
    tabCounter: appState.tabCounter,
    gods,
    theme: appState.theme,
    viewMode: appState.viewMode,
    focusedGod: appState.focusedGod
  }
}

function broadcastState() {
  broadcast('state:sync', getStateForBroadcast())
}

// State
let mainWindow = null
let wss = null
const wsClients = new Set()
const ptyProcesses = new Map() // godName -> { pty, clients: Set<ws> }
let terminalCounter = 0
let healthCheckInterval = null

// Service definitions
const SERVICES = {
  speak: { port: 8765, name: 'Speak', icon: '🔊', script: 'brain/speak/server.py' },
  hear: { port: 8766, name: 'Hear', icon: '👂', script: 'brain/hear/server.py' },
  express: { port: 8767, name: 'Express', icon: '💬', script: 'brain/express/server.py' },
  wake: { port: null, name: 'Wake', icon: '⌨️', script: 'brain/wake/listener.py' }
}

// Current service status
const serviceStatus = {
  speak: false,
  hear: false,
  express: false,
  wake: false
}

const PANTHEON = {
  zeus:       { color: '#ffd700', voice: 'zeus' },
  apollo:     { color: '#ffeb3b', voice: 'apollo' },
  artemis:    { color: '#009688', voice: 'artemis' },
  athena:     { color: '#2196f3', voice: 'athena' },
  hermes:     { color: '#ff9800', voice: 'hermes' },
  hades:      { color: '#9c27b0', voice: 'hades' },
  poseidon:   { color: '#00bcd4', voice: 'poseidon' },
  hera:       { color: '#e91e63', voice: 'hera' },
  ares:       { color: '#f44336', voice: 'ares' },
  hephaestus: { color: '#cd7f32', voice: 'hephaestus' },
  aphrodite:  { color: '#ff6b9d', voice: 'aphrodite' },
  dionysus:   { color: '#7c4dff', voice: 'dionysus' },
  demeter:    { color: '#4caf50', voice: 'demeter' }
}

// --- SERVICE HEALTH CHECKS ---

async function checkServiceHealth(name, port) {
  // For services without a port, check if process is running
  if (!port) {
    return new Promise((resolve) => {
      const script = SERVICES[name]?.script
      if (!script) return resolve(false)
      try {
        execSync(`pgrep -f "${script}"`, { stdio: 'ignore' })
        resolve(true)
      } catch {
        resolve(false)
      }
    })
  }

  // For HTTP services, check health endpoint
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 1000 }, (res) => {
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

async function checkAllServices() {
  const results = await Promise.all([
    checkServiceHealth('speak', SERVICES.speak.port),
    checkServiceHealth('hear', SERVICES.hear.port),
    checkServiceHealth('express', SERVICES.express.port),
    checkServiceHealth('wake', SERVICES.wake.port)
  ])

  const changed = (
    serviceStatus.speak !== results[0] ||
    serviceStatus.hear !== results[1] ||
    serviceStatus.express !== results[2] ||
    serviceStatus.wake !== results[3]
  )

  serviceStatus.speak = results[0]
  serviceStatus.hear = results[1]
  serviceStatus.express = results[2]
  serviceStatus.wake = results[3]

  // Broadcast if changed
  if (changed) {
    broadcast('services:status', { services: serviceStatus })
  }
}

function startHealthChecks() {
  // Check immediately
  checkAllServices()
  // Then every 3 seconds
  healthCheckInterval = setInterval(checkAllServices, 3000)
}

function stopHealthChecks() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval)
    healthCheckInterval = null
  }
}

// Service processes
const serviceProcesses = {}

function startService(name) {
  if (serviceProcesses[name]) {
    console.log(`Service ${name} already running`)
    return
  }

  const script = SERVICES[name]?.script
  if (!script) return

  const projectRoot = path.join(__dirname, '../..')
  const scriptPath = path.join(projectRoot, script)

  console.log(`Starting ${name} service...`)

  const proc = spawn('uv', ['run', scriptPath], {
    cwd: projectRoot,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      CUDA_VISIBLE_DEVICES: '0'  // Use GPU 0 (RTX 3080)
    }
  })

  proc.unref()
  serviceProcesses[name] = proc.pid

  // Check health after a moment
  setTimeout(() => checkAllServices(), 2000)
}

function stopService(name) {
  const pid = serviceProcesses[name]
  if (pid) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch (e) {
      // Process may already be dead
    }
    delete serviceProcesses[name]
  }

  // Also try to kill by port
  const port = SERVICES[name]?.port
  if (port) {
    try {
      execSync(`lsof -ti:${port} | xargs -r kill`, { stdio: 'ignore' })
    } catch (e) {
      // No process on port
    }
  }

  // Also kill by script name (catches zombies not listening on port)
  const script = SERVICES[name]?.script
  if (script) {
    try {
      execSync(`pkill -f "${script}"`, { stdio: 'ignore' })
    } catch (e) {
      // No matching process
    }
  }

  setTimeout(() => checkAllServices(), 500)
}

// --- DTACH HELPERS ---

function getSocketPath(godName) {
  return path.join(SOCKET_DIR, `${godName.toLowerCase()}.sock`)
}

function socketExists(godName) {
  const socketPath = getSocketPath(godName)
  return fs.existsSync(socketPath)
}

function listGodSockets() {
  try {
    const files = fs.readdirSync(SOCKET_DIR)
    return files
      .filter(f => f.endsWith('.sock'))
      .map(f => {
        const name = f.replace('.sock', '')
        const capitalName = name.charAt(0).toUpperCase() + name.slice(1)
        const god = PANTHEON[name.toLowerCase()] || { color: '#888', voice: 'emma' }
        return {
          name: capitalName,
          socketPath: path.join(SOCKET_DIR, f),
          color: god.color,
          voice: god.voice,
          status: 'laboring'
        }
      })
  } catch {
    return []
  }
}

function createGodSession(name, task = '') {
  const godKey = name.toLowerCase()
  const socketPath = getSocketPath(godKey)
  const god = PANTHEON[godKey] || { color: '#888', voice: 'emma' }

  if (socketExists(godKey)) {
    return {
      name,
      socketPath,
      color: god.color,
      voice: god.voice,
      status: 'laboring',
      exists: true
    }
  }

  // Build init prompt with god identity (always include identity)
  const identity = `You are ${name}. Voice: ${god.voice}.`
  const initPrompt = task
    ? `${task}\n\n${identity}\n\nAnnounce yourself, then begin.`
    : `${identity}\n\nAnnounce yourself and ask what Paul needs.`

  // Build command
  const escapedPrompt = initPrompt.replace(/"/g, '\\"').replace(/\n/g, '\\n')
  const cmd = `claude --dangerously-skip-permissions "${escapedPrompt}"`

  try {
    // Create detached dtach session
    // -n = create new socket, run detached
    // -E = disable detach character (we manage lifecycle)
    const projectRoot = path.join(__dirname, '../..')
    execSync(`dtach -n "${socketPath}" -E ${cmd}`, {
      stdio: 'ignore',
      detached: true,
      cwd: projectRoot,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        FORCE_COLOR: '3',
        GOD_NAME: name
      }
    })

    return {
      name,
      socketPath,
      color: god.color,
      voice: god.voice,
      status: 'laboring'
    }
  } catch (e) {
    console.error('Failed to create dtach session:', e)
    return null
  }
}

function createTerminalSession(options = {}) {
  const { command, name: customName, color, cwd } = options

  terminalCounter++
  const name = customName || `Terminal${terminalCounter}`
  const socketPath = getSocketPath(name.toLowerCase().replace(/[^a-z0-9]/g, '-'))

  // If socket already exists, return existing session
  if (fs.existsSync(socketPath)) {
    return {
      name,
      socketPath,
      color: color || '#888888',
      status: 'laboring',
      exists: true
    }
  }

  try {
    // Build command - either custom command or bash
    const shellCmd = command || 'bash'
    const workDir = cwd || path.join(__dirname, '../..')

    // Create detached dtach session
    execSync(`dtach -n "${socketPath}" -E ${shellCmd}`, {
      stdio: 'ignore',
      detached: true,
      cwd: workDir,
      shell: true,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        FORCE_COLOR: '3'
      }
    })

    // Give it a moment to start
    execSync('sleep 0.2')

    return {
      name,
      socketPath,
      color: color || '#888888',
      status: 'laboring'
    }
  } catch (e) {
    console.error('Failed to create terminal session:', e)
    return null
  }
}

function killGodSession(godName) {
  const socketPath = getSocketPath(godName.toLowerCase())

  // Find and kill the process attached to this socket
  try {
    // Get PID from lsof
    const output = execSync(`lsof -t "${socketPath}" 2>/dev/null`, { encoding: 'utf-8' }).trim()
    if (output) {
      const pids = output.split('\n')
      pids.forEach(pid => {
        try {
          process.kill(parseInt(pid), 'SIGTERM')
        } catch {}
      })
    }
  } catch {}

  // Remove socket file if it still exists
  try {
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath)
    }
  } catch {}

  return true
}

// --- PTY MANAGEMENT ---

function attachPty(godName, ws, cols, rows) {
  const socketPath = getSocketPath(godName.toLowerCase())

  if (!fs.existsSync(socketPath)) {
    ws.send(JSON.stringify({ event: 'error', message: `Socket not found: ${socketPath}` }))
    return
  }

  // If PTY already exists for this god, just add client
  if (ptyProcesses.has(godName)) {
    const entry = ptyProcesses.get(godName)
    entry.clients.add(ws)
    return
  }

  // Spawn PTY running dtach attach
  const ptyProcess = pty.spawn('dtach', ['-a', socketPath], {
    name: 'xterm-256color',
    cols: cols || 120,
    rows: rows || 40,
    cwd: process.env.HOME,
    env: process.env
  })

  const clients = new Set([ws])
  ptyProcesses.set(godName, { pty: ptyProcess, clients, socketPath })

  // Trigger redraw with resize jiggle
  // First resize to different dimensions, then back - forces full repaint
  const actualCols = cols || 120
  const actualRows = rows || 40
  setTimeout(() => {
    if (ptyProcess && !ptyProcess.killed) {
      ptyProcess.resize(actualCols - 1, actualRows - 1)
      setTimeout(() => {
        if (ptyProcess && !ptyProcess.killed) {
          ptyProcess.resize(actualCols, actualRows)
        }
      }, 50)
    }
  }, 100)

  // Forward PTY output to all connected clients
  ptyProcess.onData((data) => {
    const entry = ptyProcesses.get(godName)
    if (!entry) return

    const msg = JSON.stringify({ event: 'pty:output', godName, data })
    entry.clients.forEach(client => {
      if (client.readyState === 1) {
        client.send(msg)
      }
    })
  })

  // Handle PTY exit
  ptyProcess.onExit(({ exitCode }) => {
    console.log(`PTY for ${godName} exited with code ${exitCode}`)
    const entry = ptyProcesses.get(godName)
    if (entry) {
      entry.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({ event: 'god:exited', godName }))
        }
      })
      ptyProcesses.delete(godName)
    }
  })
}

function detachPty(godName, ws) {
  const entry = ptyProcesses.get(godName)
  if (!entry) return

  entry.clients.delete(ws)

  // If no more clients, kill PTY (but NOT the dtach session)
  if (entry.clients.size === 0) {
    entry.pty.kill()
    ptyProcesses.delete(godName)
  }
}

function sendToPty(godName, data) {
  const entry = ptyProcesses.get(godName)
  if (entry) {
    entry.pty.write(data)
  }
}

function resizePty(godName, cols, rows) {
  const entry = ptyProcesses.get(godName)
  if (entry) {
    entry.pty.resize(cols, rows)
  }
}

// --- WEBSOCKET SERVER ---

function broadcast(event, data = {}) {
  const msg = JSON.stringify({ event, ...data })
  wsClients.forEach(ws => {
    if (ws.readyState === 1) ws.send(msg)
  })
}

function handleMessage(ws, msg) {
  const { event, ...data } = msg

  switch (event) {
    // God lifecycle
    case 'god:spawn': {
      const god = createGodSession(data.name, data.task)
      if (god && !god.exists) {
        // Add to appState
        const godsInTab = Object.values(appState.gods).filter(g => g.tabId === appState.activeTabId)
        appState.gods[god.name] = { tabId: appState.activeTabId, order: godsInTab.length }
        saveState()
        broadcastState()
      } else if (god?.exists) {
        // Session already exists, just notify this client
        ws.send(JSON.stringify({ event: 'god:spawned', ...god }))
      }
      break
    }

    case 'terminal:spawn': {
      const terminal = createTerminalSession({
        command: data.command,
        name: data.name,
        color: data.color,
        cwd: data.cwd
      })
      if (terminal && !terminal.exists) {
        // Add to appState
        const godsInTab = Object.values(appState.gods).filter(g => g.tabId === appState.activeTabId)
        appState.gods[terminal.name] = { tabId: appState.activeTabId, order: godsInTab.length }
        saveState()
        broadcastState()
      } else if (terminal?.exists) {
        ws.send(JSON.stringify({ event: 'god:spawned', ...terminal }))
      }
      break
    }

    case 'god:kill': {
      const godName = data.godName || data.name
      // Detach all PTYs first
      if (ptyProcesses.has(godName)) {
        const entry = ptyProcesses.get(godName)
        entry.pty.kill()
        ptyProcesses.delete(godName)
      }
      // Kill dtach session
      killGodSession(godName)
      // Remove from appState
      delete appState.gods[godName]
      // Clear focus if this was the focused god
      if (appState.focusedGod === godName) {
        appState.focusedGod = null
        // Exit focus mode if no focused god
        if (appState.viewMode === 'focus') {
          appState.viewMode = 'grid'
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

    case 'service:start': {
      const service = data.service
      if (service && SERVICES[service]) {
        startService(service)
      }
      break
    }

    case 'service:stop': {
      const service = data.service
      if (service && SERVICES[service]) {
        stopService(service)
      }
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
      sendToPty(data.godName, data.data)
      break
    }

    case 'pty:resize': {
      resizePty(data.godName, data.cols, data.rows)
      break
    }

    // Tab management
    case 'tab:add': {
      appState.tabCounter++
      const newTab = { id: appState.tabCounter, name: data.name || `Tab ${appState.tabCounter}` }
      appState.tabs.push(newTab)
      appState.activeTabId = newTab.id
      saveState()
      broadcastState()
      break
    }

    case 'tab:remove': {
      const tabId = data.tabId
      // Remove gods in this tab from state (they'll be killed separately by client)
      Object.keys(appState.gods).forEach(name => {
        if (appState.gods[name].tabId === tabId) delete appState.gods[name]
      })
      appState.tabs = appState.tabs.filter(t => t.id !== tabId)
      if (appState.tabs.length === 0) {
        appState.tabs = [{ id: 1, name: 'Main' }]
        appState.tabCounter = 1
        appState.activeTabId = 1
      } else if (appState.activeTabId === tabId) {
        appState.activeTabId = appState.tabs[0].id
      }
      saveState()
      broadcastState()
      break
    }

    case 'tab:select': {
      appState.activeTabId = data.tabId
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

    case 'god:move': {
      if (appState.gods[data.godName]) {
        appState.gods[data.godName].tabId = data.tabId
        // Recalculate order in target tab
        const godsInTab = Object.entries(appState.gods)
          .filter(([_, g]) => g.tabId === data.tabId)
          .sort((a, b) => a[1].order - b[1].order)
        godsInTab.forEach(([name, _], idx) => {
          appState.gods[name].order = idx
        })
      }
      saveState()
      broadcastState()
      break
    }

    case 'god:move-to-new-tab': {
      // Create new tab
      appState.tabCounter++
      const newTab = { id: appState.tabCounter, name: `Tab ${appState.tabCounter}` }
      appState.tabs.push(newTab)
      appState.activeTabId = newTab.id

      // Move god to new tab
      if (appState.gods[data.godName]) {
        appState.gods[data.godName].tabId = newTab.id
        appState.gods[data.godName].order = 0
      }

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

    case 'viewMode:set': {
      appState.viewMode = data.mode || 'grid'
      appState.focusedGod = data.focusedGod || null
      // Clear focusedGod if switching to grid mode
      if (appState.viewMode === 'grid') {
        appState.focusedGod = null
      }
      saveState()
      broadcastState()
      break
    }

    case 'focus:set': {
      // Just update focused god without changing view mode
      appState.focusedGod = data.godName || null
      saveState()
      broadcastState()
      break
    }

    // Forward voice/other events to all clients
    default:
      broadcast(event, data)
  }
}

function createWSServer() {
  wss = new WebSocketServer({ port: WS_PORT })

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
        handleMessage(ws, msg)
      } catch (e) {
        console.error('Invalid message:', e)
      }
    })

    ws.on('close', () => {
      wsClients.delete(ws)
      // Detach from all PTYs this client was connected to
      ptyProcesses.forEach((entry, godName) => {
        entry.clients.delete(ws)
        if (entry.clients.size === 0) {
          entry.pty.kill()
          ptyProcesses.delete(godName)
        }
      })
      console.log(`Client disconnected (${wsClients.size} total)`)
    })
  })

  console.log(`WebSocket server on :${WS_PORT}`)
  return wss
}

// --- ELECTRON ---

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  // Hide menu bar completely
  mainWindow.setMenuBarVisibility(false)

  // Enable zoom shortcuts (Ctrl+Plus, Ctrl+Minus, Ctrl+0)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && !input.alt && !input.meta) {
      const zoomLevel = mainWindow.webContents.getZoomLevel()
      let zoomed = false

      // Ctrl++ or Ctrl+= (zoom in)
      if (input.key === '+' || input.key === '=') {
        mainWindow.webContents.setZoomLevel(zoomLevel + 0.5)
        zoomed = true
      }
      // Ctrl+- (zoom out)
      else if (input.key === '-') {
        mainWindow.webContents.setZoomLevel(zoomLevel - 0.5)
        zoomed = true
      }
      // Ctrl+0 (reset zoom)
      else if (input.key === '0') {
        mainWindow.webContents.setZoomLevel(0)
        zoomed = true
      }

      if (zoomed) {
        event.preventDefault()
        // Trigger terminal refit after zoom
        setTimeout(() => {
          mainWindow.webContents.executeJavaScript("window.dispatchEvent(new Event('iris:refit'))")
        }, 100)
      }
    }
  })

  // In development, load from Vite dev server
  if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    // In production, load built files
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Forward renderer console to terminal
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const prefix = ['[LOG]', '[WARN]', '[ERR]'][level] || '[LOG]'
    console.log(`${prefix} ${message}`)
  })
}

// --- APP LIFECYCLE ---

app.whenReady().then(() => {
  loadState()  // Load persisted state before starting WebSocket server
  createWSServer()
  startHealthChecks()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // Kill all PTY processes (but NOT the dtach sessions - they persist)
  ptyProcesses.forEach((entry) => {
    entry.pty.kill()
  })
  ptyProcesses.clear()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  // Clean up
  stopHealthChecks()
  if (wss) {
    wss.close()
  }
  ptyProcesses.forEach((entry) => {
    entry.pty.kill()
  })
})
