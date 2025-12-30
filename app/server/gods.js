import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn, execSync } from 'child_process'
import { SOCKET_DIR, PANTHEON } from './config.js'

const isMac = process.platform === 'darwin'

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude/projects')

// Find the actual dtach master PID by querying who owns the socket
// dtach forks internally, so the spawned child.pid is NOT the master process
function getDtachMasterPid(socketPath) {
  try {
    if (isMac) {
      // macOS: use lsof to find process using the socket
      const output = execSync(`lsof -t "${socketPath}" 2>/dev/null`, { encoding: 'utf-8' })
      const pid = parseInt(output.trim().split('\n')[0])
      return pid > 0 ? pid : null
    } else {
      // Linux: use fuser (returns PIDs using the socket)
      const output = execSync(`fuser "${socketPath}" 2>/dev/null`, { encoding: 'utf-8' })
      const pid = parseInt(output.trim().split(/\s+/)[0])
      return pid > 0 ? pid : null
    }
  } catch {
    return null
  }
}

// Re-export for pty.js
export { SOCKET_DIR }

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

let terminalCounter = 0

export function sanitizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-')
}

export function getSocketPath(godName) {
  return path.join(SOCKET_DIR, `${sanitizeName(godName)}.sock`)
}

export function getPidPath(godName) {
  return path.join(SOCKET_DIR, `${sanitizeName(godName)}.pid`)
}

export function socketExists(godName) {
  return fs.existsSync(getSocketPath(godName))
}

export function listGodSockets() {
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
          status: 'working'
        }
      })
  } catch {
    return []
  }
}

export function createGodSession(name, task = '', projectRoot, options = {}) {
  const godKey = name.toLowerCase()
  const socketPath = getSocketPath(godKey)
  const god = PANTHEON[godKey] || { color: '#888', voice: 'emma' }
  const { resumeSessionId, startPrompt, userName } = options

  if (socketExists(godKey)) {
    if (resumeSessionId) {
      // Resurrection: kill existing socket to make room for the resumed session
      killGodSession(godKey)
    } else {
      return {
        name,
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

  // Build dtach command args
  let dtachArgs = ['-n', socketPath, '-E', 'claude', '--dangerously-skip-permissions']

  if (resumeSessionId) {
    // Resume existing session
    dtachArgs.push('--resume', resumeSessionId)
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

    // Pass prompt directly - no shell escaping needed with spawn
    dtachArgs.push(initPrompt)
  }

  try {
    // Use spawn with detached:true - this calls setsid() internally on Unix (both Linux and macOS)
    const child = spawn('dtach', dtachArgs, {
      detached: true,
      stdio: 'ignore',
      cwd: projectRoot,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        FORCE_COLOR: '3',
        GOD_NAME: name
      }
    })
    child.unref()

    // Wait for dtach to fork and create the socket
    Bun.sleepSync(300)

    // Get the ACTUAL dtach master PID (dtach forks, so child.pid is the parent that exits)
    const pid = getDtachMasterPid(socketPath)
    const pidFile = getPidPath(godKey)
    if (pid) {
      fs.writeFileSync(pidFile, String(pid))
    }

    // Wait for Claude to create its session file
    Bun.sleepSync(200)

    // Find the new session ID (one that wasn't there before)
    let sessionId = resumeSessionId || null
    if (!resumeSessionId) {
      const sessionsAfter = getSessionIds(projectRoot)
      sessionId = sessionsAfter.find(id => !sessionsBefore.has(id)) || getLatestSessionId(projectRoot)
    }

    return {
      name,
      socketPath,
      color: god.color,
      voice: god.voice,
      status: 'working',
      mission: task || null,
      sessionId,
      pid
    }
  } catch (e) {
    console.error('Failed to create dtach session:', e)
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

export function createTerminalSession(options = {}, projectRoot) {
  const { command, name: customName, color, cwd } = options

  terminalCounter++
  const displayName = customName || `Terminal ${terminalCounter}`
  const sanitized = sanitizeName(displayName)
  // Use the same name derivation as listGodSockets so they match
  const name = sanitized.charAt(0).toUpperCase() + sanitized.slice(1)
  const socketPath = path.join(SOCKET_DIR, `${sanitized}.sock`)

  if (fs.existsSync(socketPath)) {
    return {
      name,
      displayName,
      socketPath,
      color: color || '#888888',
      status: 'working',
      exists: true
    }
  }

  try {
    const workDir = cwd || projectRoot
    const pidFile = path.join(SOCKET_DIR, `${sanitized}.pid`)

    // Build dtach args - use bash -c for custom commands, plain bash otherwise
    const dtachArgs = command
      ? ['-n', socketPath, '-E', 'bash', '-c', command]
      : ['-n', socketPath, '-E', 'bash']

    // Use spawn with detached:true - cross-platform setsid equivalent
    const child = spawn('dtach', dtachArgs, {
      detached: true,
      stdio: 'ignore',
      cwd: workDir,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        FORCE_COLOR: '3'
      }
    })
    child.unref()

    // Wait for dtach to fork and create the socket
    Bun.sleepSync(300)

    // Get the ACTUAL dtach master PID (dtach forks, so child.pid is the parent that exits)
    const pid = getDtachMasterPid(socketPath)
    if (pid) {
      fs.writeFileSync(pidFile, String(pid))
    }

    return {
      name,
      displayName,
      socketPath,
      color: color || '#888888',
      status: 'working',
      pid
    }
  } catch (e) {
    console.error('Failed to create terminal session:', e)
    return null
  }
}

export function killGodSession(godName) {
  const sanitized = godName.toLowerCase()
  const socketPath = getSocketPath(sanitized)
  const pidFile = getPidPath(sanitized)

  let killed = false

  // Try stored PID first
  if (fs.existsSync(pidFile)) {
    try {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim())
      if (pid > 0) {
        // Kill entire process group (negative PID) - POSIX standard
        process.kill(-pid, 'SIGTERM')
        killed = true
      }
    } catch (e) {
      // PID might be stale, continue to socket-based lookup
    }
  }

  // If stored PID didn't work, try to find the actual process via socket
  if (!killed && fs.existsSync(socketPath)) {
    const livePid = getDtachMasterPid(socketPath)
    if (livePid) {
      try {
        process.kill(-livePid, 'SIGTERM')
        killed = true
      } catch {
        // Try killing just the process if group kill fails
        try {
          process.kill(livePid, 'SIGTERM')
          killed = true
        } catch {}
      }
    }
  }

  // Last resort: use fuser/lsof to kill anything using the socket
  if (!killed && fs.existsSync(socketPath)) {
    try {
      if (isMac) {
        execSync(`lsof -t "${socketPath}" 2>/dev/null | xargs kill 2>/dev/null`, { encoding: 'utf-8' })
      } else {
        execSync(`fuser -k "${socketPath}" 2>/dev/null`, { encoding: 'utf-8' })
      }
    } catch {}
  }

  // Clean up files
  try { fs.unlinkSync(pidFile) } catch {}
  try { fs.unlinkSync(socketPath) } catch {}

  return true
}
