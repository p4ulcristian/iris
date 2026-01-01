import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { execSync, spawnSync } from 'child_process'
import { SOCKET_DIR, PANTHEON, ZELLIJ_CONFIG_DIR, ZELLIJ_BIN } from './config.js'
import { loadProfile } from './profiles.js'

const SESSION_PREFIX = 'iris-'
const HOME = os.homedir()

// Strip ANSI escape codes from string
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '')
}

// Build PATH with common locations for claude and other tools
function getExtendedPath() {
  const paths = [
    process.env.PATH,
    '/usr/local/bin',
    '/opt/homebrew/bin',
    `${HOME}/.local/bin`,
    `${HOME}/.bun/bin`,
  ]

  // Add NVM node paths (check for existing versions)
  const nvmDir = `${HOME}/.nvm/versions/node`
  try {
    if (fs.existsSync(nvmDir)) {
      const versions = fs.readdirSync(nvmDir)
      versions.forEach(v => paths.push(`${nvmDir}/${v}/bin`))
    }
  } catch {}

  return paths.filter(Boolean).join(':')
}

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

// Check if session is active (not EXITED)
export function isSessionActive(name) {
  const sessionName = getSessionName(name)
  try {
    const result = execSync(`"${ZELLIJ_BIN}" list-sessions 2>/dev/null || true`, { encoding: 'utf-8' })
    const line = result.split('\n').find(l => l.includes(sessionName))
    // EXITED sessions show "(EXITED" in output
    return line && !line.includes('EXITED')
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
        // Strip ANSI codes first - zellij outputs colored text
        const sessionName = stripAnsi(line.split(/\s+/)[0].trim())
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

export function createGodSession(name, task = '', projectRoot, options = {}) {
  const godKey = name.toLowerCase()
  const sessionName = getSessionName(godKey)
  const god = PANTHEON[godKey] || { color: '#888', voice: 'emma' }
  const { resumeSessionId, startPrompt, profile = 'gods' } = options

  // Check if session already exists
  if (sessionExists(godKey)) {
    if (resumeSessionId || !isSessionActive(godKey)) {
      // Resurrection OR dead session - clean up and recreate
      killGodSession(godKey)
    } else {
      // Active session - reattach
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

  // Generate session ID upfront (we control it, no detection needed)
  const sessionId = resumeSessionId || crypto.randomUUID()

  // Build claude command
  let claudeArgs = ['--dangerously-skip-permissions']
  let profileTempFile = null

  // Load and apply profile (if not resuming)
  if (!resumeSessionId && profile && profile !== 'none') {
    const profileContent = loadProfile(profile)
    if (profileContent) {
      // Write profile to temp file to preserve newlines (shell args mangle them)
      profileTempFile = path.join(os.tmpdir(), `iris-profile-${godKey}-${Date.now()}.md`)
      fs.writeFileSync(profileTempFile, profileContent)
      // Don't add to claudeArgs - we'll handle it separately in the command
    }
  }

  if (resumeSessionId) {
    // Resume existing session
    claudeArgs.push('--resume', resumeSessionId)
  } else {
    // New session - use our pre-generated session ID
    claudeArgs.push('--session-id', sessionId)

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
    // Build command parts separately to handle profile file with proper shell expansion
    let claudeCmd = `claude ${claudeArgs.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`

    // Add profile from temp file using shell expansion (preserves newlines)
    if (profileTempFile) {
      claudeCmd = `claude --dangerously-skip-permissions --append-system-prompt "$(cat '${profileTempFile}')" ${claudeArgs.slice(1).map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`
    }

    // Step 1: Create detached zellij session in background
    const zellijEnv = {
      ...process.env,
      PATH: getExtendedPath(),
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

    // Clean up temp profile file
    if (profileTempFile) {
      try { fs.unlinkSync(profileTempFile) } catch {}
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
    // Clean up temp profile file on error
    if (profileTempFile) {
      try { fs.unlinkSync(profileTempFile) } catch {}
    }
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
      PATH: getExtendedPath(),
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
    execSync(`"${ZELLIJ_BIN}" delete-session "${sessionName}" --force 2>/dev/null || true`, { stdio: 'ignore' })
  } catch {}

  // Clean up any leftover buffer files
  const bufferPath = path.join(SOCKET_DIR, `${sanitizeName(godName)}.buf`)
  try { fs.unlinkSync(bufferPath) } catch {}

  return true
}
