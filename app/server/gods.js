import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import { spawn, spawnSync, execSync } from 'child_process'
import { SOCKET_DIR, PANTHEON } from './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Detect bundled abduco binary (in packaged app) or fall back to system abduco
function getAbducoPath() {
  // In packaged app: resources/app.asar.unpacked/server/ → resources/abduco/abduco
  const bundledPath = path.join(__dirname, '..', '..', 'abduco', 'abduco')
  if (fs.existsSync(bundledPath)) {
    return bundledPath
  }
  // Fall back to system abduco
  return 'abduco'
}

export const ABDUCO_PATH = getAbducoPath()
const SESSION_PREFIX = 'iris-'
const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude/projects')

// Cross-runtime sleep (works with both Bun and Node)
function sleepSync(ms) {
  if (typeof Bun !== 'undefined' && Bun.sleepSync) {
    Bun.sleepSync(ms)
  } else {
    const seconds = ms / 1000
    try {
      execSync(`sleep ${seconds}`, { stdio: 'ignore' })
    } catch {
      const end = Date.now() + ms
      while (Date.now() < end) { /* spin */ }
    }
  }
}

let terminalCounter = 0

export function sanitizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-')
}

// Get abduco socket path for a god/terminal
export function getSocketPath(godName) {
  return path.join(SOCKET_DIR, `${SESSION_PREFIX}${sanitizeName(godName)}.sock`)
}

// Legacy alias for session name (now returns socket path)
export function getSessionName(name) {
  return getSocketPath(name)
}

// Check if abduco session exists (socket file exists and is active)
export function sessionExists(name) {
  const socketPath = getSocketPath(name)
  if (!fs.existsSync(socketPath)) {
    return false
  }
  // Check if the socket is still active by trying to connect
  try {
    // abduco -a will fail quickly if socket is stale
    execSync(`"${ABDUCO_PATH}" -a "${socketPath}" -e '^_' </dev/null 2>/dev/null &`, {
      timeout: 100,
      stdio: 'ignore'
    })
    return true
  } catch {
    // Socket exists but may be stale - try to clean up
    try { fs.unlinkSync(socketPath) } catch {}
    return false
  }
}

// Backwards compat alias
export function socketExists(godName) {
  return sessionExists(godName)
}

// Re-export SOCKET_DIR for buffer file paths
export { SOCKET_DIR }

// List all iris abduco sessions
export function listGodSessions() {
  try {
    // Ensure socket directory exists
    if (!fs.existsSync(SOCKET_DIR)) {
      return []
    }

    const files = fs.readdirSync(SOCKET_DIR)
      .filter(f => f.startsWith(SESSION_PREFIX) && f.endsWith('.sock'))

    return files.map(fileName => {
      const name = fileName.replace(SESSION_PREFIX, '').replace('.sock', '')
      const capitalName = name.charAt(0).toUpperCase() + name.slice(1)
      const god = PANTHEON[name.toLowerCase()] || { color: '#888', voice: 'emma' }
      const socketPath = path.join(SOCKET_DIR, fileName)

      // Check if session is still active
      if (!fs.existsSync(socketPath)) {
        return null
      }

      return {
        name: capitalName,
        sessionName: socketPath,
        socketPath,
        color: god.color,
        voice: god.voice,
        status: 'working'
      }
    }).filter(Boolean)
  } catch {
    return []
  }
}

// Backwards compat alias
export function listGodSockets() {
  return listGodSessions()
}

// Get the most recent Claude session ID for a project
export function getLatestSessionId(projectPath) {
  try {
    const projectFolder = projectPath.replace(/\//g, '-')
    const projectDir = path.join(CLAUDE_PROJECTS_DIR, projectFolder)

    if (!fs.existsSync(projectDir)) return null

    const files = fs.readdirSync(projectDir)
      .filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))
      .map(f => ({
        id: f.replace('.jsonl', ''),
        mtime: fs.statSync(path.join(projectDir, f)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime)

    return files.length > 0 ? files[0].id : null
  } catch {
    return null
  }
}

// Get all session IDs for a project
function getSessionIds(projectPath) {
  try {
    const projectFolder = projectPath.replace(/\//g, '-')
    const projectDir = path.join(CLAUDE_PROJECTS_DIR, projectFolder)

    if (!fs.existsSync(projectDir)) return []

    return fs.readdirSync(projectDir)
      .filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))
      .map(f => f.replace('.jsonl', ''))
  } catch {
    return []
  }
}

export function createGodSession(name, task = '', projectRoot, options = {}) {
  const godKey = name.toLowerCase()
  const socketPath = getSocketPath(godKey)
  const god = PANTHEON[godKey] || { color: '#888', voice: 'emma' }
  const { resumeSessionId, startPrompt, userName } = options

  // Ensure socket directory exists
  if (!fs.existsSync(SOCKET_DIR)) {
    fs.mkdirSync(SOCKET_DIR, { recursive: true })
  }

  // Check if session already exists
  if (fs.existsSync(socketPath)) {
    if (resumeSessionId) {
      // Resurrection: kill existing session to make room
      killGodSession(godKey)
    } else {
      return {
        name,
        sessionName: socketPath,
        socketPath,
        color: god.color,
        voice: god.voice,
        status: 'working',
        exists: true
      }
    }
  }

  // Record sessions before spawn so we can detect the new one
  const sessionsBefore = new Set(getSessionIds(projectRoot))

  // Build claude command
  let claudeArgs = ['--dangerously-skip-permissions']

  if (resumeSessionId) {
    claudeArgs.push('--resume', resumeSessionId)
  } else {
    // Build init prompt with god identity
    const identity = `You are ${name}. Voice: ${god.voice}.`

    let initPrompt = ''
    if (startPrompt) {
      initPrompt += startPrompt + '\n\n'
    }
    if (task) {
      initPrompt += task + '\n\n'
    }
    initPrompt += identity

    claudeArgs.push(initPrompt)
  }

  try {
    // Create abduco session with claude command
    // -n: create new session but don't attach
    // The command is passed as a single string after the socket path
    const claudeCmd = `claude ${claudeArgs.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`

    spawnSync(ABDUCO_PATH, ['-n', socketPath, 'bash', '-c', claudeCmd], {
      cwd: projectRoot,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        FORCE_COLOR: '3',
        GOD_NAME: name
      },
      stdio: 'ignore'
    })

    // Wait for Claude to create its session file
    sleepSync(500)

    // Find the new session ID
    let sessionId = resumeSessionId || null
    if (!resumeSessionId) {
      const sessionsAfter = getSessionIds(projectRoot)
      sessionId = sessionsAfter.find(id => !sessionsBefore.has(id)) || getLatestSessionId(projectRoot)
    }

    return {
      name,
      sessionName: socketPath,
      socketPath,
      color: god.color,
      voice: god.voice,
      status: 'working',
      mission: task || null,
      sessionId
    }
  } catch (e) {
    console.error('Failed to create abduco session:', e)
    return null
  }
}

export function createTerminalSession(options = {}, projectRoot) {
  const { command, name: customName, color, cwd } = options

  terminalCounter++
  const displayName = customName || `Terminal ${terminalCounter}`
  const sanitized = sanitizeName(displayName)
  const name = sanitized.charAt(0).toUpperCase() + sanitized.slice(1)
  const socketPath = getSocketPath(sanitized)

  // Ensure socket directory exists
  if (!fs.existsSync(SOCKET_DIR)) {
    fs.mkdirSync(SOCKET_DIR, { recursive: true })
  }

  // Check if session already exists
  if (fs.existsSync(socketPath)) {
    return {
      name,
      displayName,
      sessionName: socketPath,
      socketPath,
      color: color || '#888888',
      status: 'working',
      exists: true
    }
  }

  try {
    const workDir = cwd || projectRoot

    // Create abduco session with bash
    const shellCmd = command ? `bash -c '${command.replace(/'/g, "'\\''")}'` : 'bash'

    spawnSync(ABDUCO_PATH, ['-n', socketPath, 'bash', '-c', shellCmd], {
      cwd: workDir,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        FORCE_COLOR: '3'
      },
      stdio: 'ignore'
    })

    // Wait for session to initialize
    sleepSync(200)

    return {
      name,
      displayName,
      sessionName: socketPath,
      socketPath,
      color: color || '#888888',
      status: 'working'
    }
  } catch (e) {
    console.error('Failed to create terminal session:', e)
    return null
  }
}

export function killGodSession(godName) {
  const socketPath = getSocketPath(godName)

  // Find and kill the abduco process by socket
  try {
    // Get the PID of the abduco server process
    const result = execSync(`lsof -t "${socketPath}" 2>/dev/null || true`, { encoding: 'utf-8' })
    const pids = result.trim().split('\n').filter(Boolean)

    for (const pid of pids) {
      try {
        process.kill(parseInt(pid), 'SIGTERM')
      } catch {}
    }
  } catch {}

  // Remove the socket file
  try { fs.unlinkSync(socketPath) } catch {}

  // Clean up any leftover buffer files
  const bufferPath = path.join(SOCKET_DIR, `${sanitizeName(godName)}.buf`)
  try { fs.unlinkSync(bufferPath) } catch {}

  return true
}
