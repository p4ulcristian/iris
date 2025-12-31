import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn, execSync } from 'child_process'
import { SOCKET_DIR, PANTHEON } from './config.js'

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

// Get tmux session name for a god/terminal
export function getSessionName(name) {
  return `${SESSION_PREFIX}${sanitizeName(name)}`
}

// For backwards compatibility with pty.js buffer paths
export function getSocketPath(godName) {
  return path.join(SOCKET_DIR, `${sanitizeName(godName)}.sock`)
}

// Check if tmux session exists
export function sessionExists(name) {
  try {
    execSync(`tmux has-session -t "${getSessionName(name)}" 2>/dev/null`)
    return true
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

// List all iris tmux sessions
export function listGodSessions() {
  try {
    const output = execSync(
      `tmux list-sessions -F "#{session_name}" 2>/dev/null | grep "^${SESSION_PREFIX}"`,
      { encoding: 'utf-8' }
    )
    return output.trim().split('\n')
      .filter(Boolean)
      .map(sessionName => {
        const name = sessionName.replace(SESSION_PREFIX, '')
        const capitalName = name.charAt(0).toUpperCase() + name.slice(1)
        const god = PANTHEON[name.toLowerCase()] || { color: '#888', voice: 'emma' }
        return {
          name: capitalName,
          sessionName,
          color: god.color,
          voice: god.voice,
          status: 'working'
        }
      })
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
  const { resumeSessionId, startPrompt, userName } = options

  // Check if session already exists
  if (sessionExists(godKey)) {
    if (resumeSessionId) {
      // Resurrection: kill existing session to make room
      killGodSession(godKey)
    } else {
      return {
        name,
        sessionName,
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
    // Build environment string for tmux
    const envVars = [
      `TERM=xterm-256color`,
      `COLORTERM=truecolor`,
      `FORCE_COLOR=3`,
      `GOD_NAME=${name}`
    ].join(' ')

    // Create tmux session with claude command
    // Use -x and -y for initial size (will be resized on attach)
    const claudeCmd = `claude ${claudeArgs.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`
    const tmuxCmd = `tmux new-session -d -s "${sessionName}" -x 120 -y 40 -c "${projectRoot}" "${envVars} ${claudeCmd}"`

    execSync(tmuxCmd, {
      cwd: projectRoot,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        FORCE_COLOR: '3',
        GOD_NAME: name
      }
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
      sessionName,
      color: god.color,
      voice: god.voice,
      status: 'working',
      mission: task || null,
      sessionId
    }
  } catch (e) {
    console.error('Failed to create tmux session:', e)
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
      color: color || '#888888',
      status: 'working',
      exists: true
    }
  }

  try {
    const workDir = cwd || projectRoot

    // Build environment string for tmux
    const envVars = [
      `TERM=xterm-256color`,
      `COLORTERM=truecolor`,
      `FORCE_COLOR=3`
    ].join(' ')

    // Create tmux session with bash
    const shellCmd = command ? `bash -c '${command.replace(/'/g, "'\\''")}'` : 'bash'
    const tmuxCmd = `tmux new-session -d -s "${sessionName}" -x 120 -y 40 -c "${workDir}" "${envVars} ${shellCmd}"`

    execSync(tmuxCmd, {
      cwd: workDir,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        FORCE_COLOR: '3'
      }
    })

    // Wait for session to initialize
    sleepSync(200)

    return {
      name,
      displayName,
      sessionName,
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
    execSync(`tmux kill-session -t "${sessionName}" 2>/dev/null`)
  } catch {
    // Session might not exist, that's fine
  }

  // Clean up any leftover buffer files
  const bufferPath = path.join(SOCKET_DIR, `${sanitizeName(godName)}.buf`)
  try { fs.unlinkSync(bufferPath) } catch {}

  return true
}
