import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { SOCKET_DIR, PANTHEON } from './config.js'

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
  const { resumeSessionId } = options

  if (socketExists(godKey)) {
    return {
      name,
      socketPath,
      color: god.color,
      voice: god.voice,
      status: 'working',
      exists: true
    }
  }

  let cmd

  if (resumeSessionId) {
    // Resume existing session
    cmd = `claude --dangerously-skip-permissions --resume "${resumeSessionId}"`
  } else {
    // Build init prompt with god identity
    const identity = `You are ${name}. Voice: ${god.voice}.`
    const initPrompt = task ? `${task}\n\n${identity}` : identity

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

    return {
      name,
      socketPath,
      color: god.color,
      voice: god.voice,
      status: 'working',
      mission: task || null
    }
  } catch (e) {
    console.error('Failed to create dtach session:', e)
    return null
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
