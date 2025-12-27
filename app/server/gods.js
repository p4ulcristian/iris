import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'
import { SOCKET_DIR, PANTHEON } from './config.js'

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude/projects')

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

  let cmd

  if (resumeSessionId) {
    // Resume existing session
    cmd = `claude --dangerously-skip-permissions --resume "${resumeSessionId}"`
  } else {
    // Build init prompt with god identity
    const identity = `You are ${name}. Voice: ${god.voice}.`

    // Combine: startPrompt (if any) + task + identity
    let initPrompt = ''
    if (startPrompt) {
      initPrompt += startPrompt + '\n\n'
    }
    if (task) {
      initPrompt += task + '\n\n'
    }
    initPrompt += identity

    // Build command - use $'...' syntax for real newlines
    const escapedPrompt = initPrompt.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    cmd = `claude --dangerously-skip-permissions $'${escapedPrompt}'`
  }

  try {
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

    // Wait briefly for Claude to create its session file
    execSync('sleep 0.5')

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
      sessionId
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
    const shellCmd = command || 'bash'
    const workDir = cwd || projectRoot

    // Wrap command in bash -c for proper argument handling
    const dtachCmd = command
      ? `dtach -n "${socketPath}" -E bash -c ${JSON.stringify(shellCmd)}`
      : `dtach -n "${socketPath}" -E bash`

    execSync(dtachCmd, {
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

    execSync('sleep 0.2')

    return {
      name,
      displayName,
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
  const socketPath = getSocketPath(godName.toLowerCase())

  // Find and kill the process attached to this socket
  try {
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
