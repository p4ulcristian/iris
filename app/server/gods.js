import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync, spawnSync } from 'child_process'
import { SOCKET_DIR, PANTHEON, ZELLIJ_CONFIG_DIR, ZELLIJ_BIN } from './config.js'

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

// Get zellij session name for a god/terminal
export function getSessionName(godName) {
  return `${SESSION_PREFIX}${sanitizeName(godName)}`
}

// Legacy alias for socket path (now returns session name for compat)
export function getSocketPath(godName) {
  return getSessionName(godName)
}

// Check if zellij session exists
export function sessionExists(name) {
  const sessionName = getSessionName(name)
  try {
    const result = execSync(`"${ZELLIJ_BIN}" list-sessions 2>/dev/null || true`, { encoding: 'utf-8' })
    return result.includes(sessionName)
  } catch {
    return false
  }
}

// Backwards compat alias
export function socketExists(godName) {
  return sessionExists(godName)
}

// Re-export SOCKET_DIR for buffer file paths
export { SOCKET_DIR }

// List all iris zellij sessions
export function listGodSessions() {
  try {
    const result = execSync(`"${ZELLIJ_BIN}" list-sessions 2>/dev/null || true`, { encoding: 'utf-8' })
    const lines = result.trim().split('\n').filter(Boolean)

    return lines
      .filter(line => line.includes(SESSION_PREFIX))
      .map(line => {
        // Parse session name from zellij output (format: "session-name [Created ...]" or just "session-name")
        const sessionName = line.split(/\s+/)[0].trim()
        if (!sessionName.startsWith(SESSION_PREFIX)) return null

        const name = sessionName.replace(SESSION_PREFIX, '')
        const capitalName = name.charAt(0).toUpperCase() + name.slice(1)
        const god = PANTHEON[name.toLowerCase()] || { color: '#888', voice: 'emma' }

        return {
          name: capitalName,
          sessionName,
          socketPath: sessionName, // For backwards compat
          color: god.color,
          voice: god.voice,
          status: 'working'
        }
      })
      .filter(Boolean)
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
  const sessionName = getSessionName(godKey)
  const god = PANTHEON[godKey] || { color: '#888', voice: 'emma' }
  const { resumeSessionId, startPrompt } = options

  // Check if session already exists
  if (sessionExists(godKey)) {
    if (resumeSessionId) {
      // Resurrection: kill existing session to make room
      killGodSession(godKey)
    } else {
      return {
        name,
        sessionName,
        socketPath: sessionName,
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
    // Create zellij session with claude command
    const claudeCmd = `claude ${claudeArgs.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`

    // Step 1: Create detached zellij session in background
    const zellijEnv = {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor'
    }

    spawnSync(ZELLIJ_BIN, ['--config-dir', ZELLIJ_CONFIG_DIR, 'attach', sessionName, '-b'], {
      cwd: projectRoot,
      env: zellijEnv,
      stdio: 'ignore'
    })

    // Wait for session to be ready
    sleepSync(500)

    // Step 2: Run claude command in-place (replaces the default shell pane)
    spawnSync(ZELLIJ_BIN, [
      '--config-dir', ZELLIJ_CONFIG_DIR,
      '-s', sessionName,
      'run', '-i', '--',
      'bash', '-c', `cd "${projectRoot}" && ${claudeCmd}`
    ], {
      env: zellijEnv,
      stdio: 'ignore'
    })

    // Wait for session to be created
    sleepSync(800)

    // Find the new session ID
    let sessionId = resumeSessionId || null
    if (!resumeSessionId) {
      const sessionsAfter = getSessionIds(projectRoot)
      sessionId = sessionsAfter.find(id => !sessionsBefore.has(id)) || getLatestSessionId(projectRoot)
    }

    return {
      name,
      sessionName,
      socketPath: sessionName,
      color: god.color,
      voice: god.voice,
      status: 'working',
      mission: task || null,
      sessionId
    }
  } catch (e) {
    console.error('Failed to create zellij session:', e)
    return null
  }
}

export function createTerminalSession(options = {}, projectRoot) {
  const { command, name: customName, color, cwd } = options

  terminalCounter++
  const displayName = customName || `Terminal ${terminalCounter}`
  const sanitized = sanitizeName(displayName)
  const name = sanitized.charAt(0).toUpperCase() + sanitized.slice(1)
  const sessionName = getSessionName(sanitized)

  // Check if session already exists
  if (sessionExists(sanitized)) {
    return {
      name,
      displayName,
      sessionName,
      socketPath: sessionName,
      color: color || '#888888',
      status: 'working',
      exists: true
    }
  }

  try {
    const workDir = cwd || projectRoot
    const shellCmd = command || 'bash'

    // Step 1: Create detached zellij session in background
    const zellijEnv = {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor'
    }

    spawnSync(ZELLIJ_BIN, ['--config-dir', ZELLIJ_CONFIG_DIR, 'attach', sessionName, '-b'], {
      cwd: workDir,
      env: zellijEnv,
      stdio: 'ignore'
    })

    // Wait for session to be ready
    sleepSync(500)

    // Step 2: Run shell command in-place (replaces the default shell pane)
    if (shellCmd !== 'bash') {
      spawnSync('zellij', [
        '--config-dir', ZELLIJ_CONFIG_DIR,
        '-s', sessionName,
        'run', '-i', '--',
        'bash', '-c', `cd "${workDir}" && ${shellCmd}`
      ], {
        env: zellijEnv,
        stdio: 'ignore'
      })
    }

    // Wait for session to initialize
    sleepSync(300)

    return {
      name,
      displayName,
      sessionName,
      socketPath: sessionName,
      color: color || '#888888',
      status: 'working'
    }
  } catch (e) {
    console.error('Failed to create terminal session:', e)
    return null
  }
}

export function killGodSession(godName) {
  const sessionName = getSessionName(godName)

  try {
    execSync(`"${ZELLIJ_BIN}" kill-session "${sessionName}" 2>/dev/null || true`, { stdio: 'ignore' })
  } catch {}

  // Clean up any leftover buffer files
  const bufferPath = path.join(SOCKET_DIR, `${sanitizeName(godName)}.buf`)
  try { fs.unlinkSync(bufferPath) } catch {}

  return true
}
