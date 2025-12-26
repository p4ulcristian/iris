import { app, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'
import { WebSocketServer } from 'ws'
import { execSync, spawn } from 'child_process'
import pty from 'node-pty'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const WS_PORT = 9999
const SOCKET_DIR = path.join(os.homedir(), '.local/share/iris/sockets')

// Ensure socket directory exists
if (!fs.existsSync(SOCKET_DIR)) {
  fs.mkdirSync(SOCKET_DIR, { recursive: true })
}

// State
let mainWindow = null
let wss = null
const wsClients = new Set()
const ptyProcesses = new Map() // godName -> { pty, clients: Set<ws> }
let terminalCounter = 0

const GOD_COLORS = {
  zeus: '#ffd700',
  apollo: '#ffeb3b',
  artemis: '#009688',
  athena: '#2196f3',
  hermes: '#ff9800',
  hades: '#9c27b0',
  poseidon: '#00bcd4',
  hera: '#e91e63',
  ares: '#f44336',
  hephaestus: '#cd7f32',
  aphrodite: '#ff6b9d',
  dionysus: '#7c4dff',
  demeter: '#4caf50'
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
        return {
          name: capitalName,
          socketPath: path.join(SOCKET_DIR, f),
          color: GOD_COLORS[name.toLowerCase()] || '#888',
          status: 'laboring'
        }
      })
  } catch {
    return []
  }
}

function createGodSession(name, task = '') {
  const godName = name.toLowerCase()
  const socketPath = getSocketPath(godName)

  if (socketExists(godName)) {
    return {
      name,
      socketPath,
      color: GOD_COLORS[godName] || '#888',
      status: 'laboring',
      exists: true
    }
  }

  // Build command
  let cmd = 'claude --dangerously-skip-permissions'
  if (task) {
    const escapedTask = task.replace(/"/g, '\\"')
    cmd = `claude --dangerously-skip-permissions "${escapedTask}"`
  }

  try {
    // Create detached dtach session
    // -n = create new socket, run detached
    // -E = disable detach character (we manage lifecycle)
    const projectRoot = path.join(__dirname, '../..')
    execSync(`dtach -n "${socketPath}" -E ${cmd}`, {
      stdio: 'ignore',
      detached: true,
      cwd: projectRoot
    })

    // Give it a moment to start
    execSync('sleep 0.3')

    return {
      name,
      socketPath,
      color: GOD_COLORS[godName] || '#888',
      status: 'laboring'
    }
  } catch (e) {
    console.error('Failed to create dtach session:', e)
    return null
  }
}

function createTerminalSession() {
  terminalCounter++
  const name = `Terminal${terminalCounter}`
  const socketPath = getSocketPath(name.toLowerCase())

  try {
    // Create detached dtach session with bash
    const projectRoot = path.join(__dirname, '../..')
    execSync(`dtach -n "${socketPath}" -E bash`, {
      stdio: 'ignore',
      detached: true,
      cwd: projectRoot
    })

    // Give it a moment to start
    execSync('sleep 0.2')

    return {
      name,
      socketPath,
      color: '#888888',  // Gray for raw terminals
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
        broadcast('god:spawned', god)
      } else if (god?.exists) {
        // Session already exists, just notify this client
        ws.send(JSON.stringify({ event: 'god:spawned', ...god }))
      }
      break
    }

    case 'terminal:spawn': {
      const terminal = createTerminalSession()
      if (terminal) {
        broadcast('god:spawned', terminal)
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
      broadcast('god:killed', { godName })
      break
    }

    case 'god:list': {
      const gods = listGodSockets()
      ws.send(JSON.stringify({ event: 'god:list', gods }))
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

    // Send initial state - discover existing god sessions
    const gods = listGodSockets()
    ws.send(JSON.stringify({
      event: 'connected',
      gods
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
  createWSServer()
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
  if (wss) {
    wss.close()
  }
  ptyProcesses.forEach((entry) => {
    entry.pty.kill()
  })
})
