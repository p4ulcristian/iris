import { app, BrowserWindow } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { WebSocketServer } from 'ws'
import { execSync, spawn } from 'child_process'
import pty from 'node-pty'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const WS_PORT = 9999
const SESSION_PREFIX = 'iris-'

// State
let mainWindow = null
let wss = null
const wsClients = new Set()
const ptyProcesses = new Map() // sessionName -> { pty, clients: Set<ws> }

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

// --- TMUX HELPERS ---

function tmux(...args) {
  try {
    return execSync(`tmux ${args.join(' ')}`, { encoding: 'utf-8' }).trim()
  } catch (e) {
    return null
  }
}

function sessionExists(name) {
  try {
    execSync(`tmux has-session -t ${SESSION_PREFIX}${name} 2>/dev/null`)
    return true
  } catch {
    return false
  }
}

function listGodSessions() {
  try {
    const output = execSync(`tmux list-sessions -F "#{session_name}" 2>/dev/null`, { encoding: 'utf-8' })
    return output
      .split('\n')
      .filter(s => s.startsWith(SESSION_PREFIX))
      .map(s => {
        const name = s.replace(SESSION_PREFIX, '')
        const capitalName = name.charAt(0).toUpperCase() + name.slice(1)
        return {
          sessionName: s,
          name: capitalName,
          color: GOD_COLORS[name.toLowerCase()] || '#888',
          status: 'laboring'
        }
      })
  } catch {
    return []
  }
}

function createGodSession(name, task = '') {
  const sessionName = `${SESSION_PREFIX}${name.toLowerCase()}`

  if (sessionExists(name.toLowerCase())) {
    return { sessionName, name, color: GOD_COLORS[name.toLowerCase()] || '#888', status: 'laboring', exists: true }
  }

  // Create tmux session with claude
  let cmd = 'claude'
  if (task) {
    const escapedTask = task.replace(/"/g, '\\"')
    cmd = `claude "${escapedTask}"`
  }

  try {
    execSync(`tmux new-session -d -s ${sessionName} "${cmd}"`)
    return {
      sessionName,
      name,
      color: GOD_COLORS[name.toLowerCase()] || '#888',
      status: 'laboring'
    }
  } catch (e) {
    console.error('Failed to create session:', e)
    return null
  }
}

function killGodSession(sessionName) {
  try {
    execSync(`tmux kill-session -t ${sessionName}`)
    return true
  } catch {
    return false
  }
}

// --- PTY MANAGEMENT ---

function attachPty(sessionName, ws, cols, rows) {
  // If PTY already exists for this session, just add client
  if (ptyProcesses.has(sessionName)) {
    const entry = ptyProcesses.get(sessionName)
    entry.clients.add(ws)
    return
  }

  // Spawn PTY running tmux attach
  const ptyProcess = pty.spawn('tmux', ['attach', '-t', sessionName], {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: process.env.HOME,
    env: process.env
  })

  const clients = new Set([ws])
  ptyProcesses.set(sessionName, { pty: ptyProcess, clients })

  // Forward PTY output to all connected clients
  ptyProcess.onData((data) => {
    const entry = ptyProcesses.get(sessionName)
    if (!entry) return

    const msg = JSON.stringify({ event: 'pty:output', sessionName, data })
    entry.clients.forEach(client => {
      if (client.readyState === 1) {
        client.send(msg)
      }
    })
  })

  // Handle PTY exit
  ptyProcess.onExit(({ exitCode }) => {
    console.log(`PTY for ${sessionName} exited with code ${exitCode}`)
    const entry = ptyProcesses.get(sessionName)
    if (entry) {
      entry.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({ event: 'god:exited', sessionName }))
        }
      })
      ptyProcesses.delete(sessionName)
    }
  })
}

function detachPty(sessionName, ws) {
  const entry = ptyProcesses.get(sessionName)
  if (!entry) return

  entry.clients.delete(ws)

  // If no more clients, kill PTY
  if (entry.clients.size === 0) {
    entry.pty.kill()
    ptyProcesses.delete(sessionName)
  }
}

function sendToPty(sessionName, data) {
  const entry = ptyProcesses.get(sessionName)
  if (entry) {
    entry.pty.write(data)
  }
}

function resizePty(sessionName, cols, rows) {
  const entry = ptyProcesses.get(sessionName)
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

    case 'god:kill': {
      const { sessionName } = data
      // Detach all PTYs first
      if (ptyProcesses.has(sessionName)) {
        const entry = ptyProcesses.get(sessionName)
        entry.pty.kill()
        ptyProcesses.delete(sessionName)
      }
      // Kill tmux session
      killGodSession(sessionName)
      broadcast('god:killed', { sessionName })
      break
    }

    case 'god:list': {
      const gods = listGodSessions()
      ws.send(JSON.stringify({ event: 'god:list', gods }))
      break
    }

    // PTY management
    case 'pty:attach': {
      attachPty(data.sessionName, ws, data.cols, data.rows)
      break
    }

    case 'pty:detach': {
      detachPty(data.sessionName, ws)
      break
    }

    case 'pty:input': {
      sendToPty(data.sessionName, data.data)
      break
    }

    case 'pty:resize': {
      resizePty(data.sessionName, data.cols, data.rows)
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
    const gods = listGodSessions()
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
      ptyProcesses.forEach((entry, sessionName) => {
        entry.clients.delete(ws)
        if (entry.clients.size === 0) {
          entry.pty.kill()
          ptyProcesses.delete(sessionName)
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
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
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
  // Kill all PTY processes
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
