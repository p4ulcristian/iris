import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { execSync, spawnSync } from 'child_process'
import { SOCKET_DIR, PANTHEON, ZELLIJ_CONFIG_DIR, ZELLIJ_BIN } from './config.js'

// Timing log file
const TIMING_LOG = path.join(os.homedir(), '.local/share/iris/logs/spawn-timing.log')
function logTiming(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  console.log(msg)
  try { fs.appendFileSync(TIMING_LOG, line) } catch {}
}
import { getComposedPrompt, getPersonalityMcpConfig } from './personalities.js'
import { getProjectsContext } from './projects.js'

// Get Iris root directory for relative MCP paths
const __dirname = path.dirname(new URL(import.meta.url).pathname)
const IRIS_ROOT = path.resolve(__dirname, '../..')

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

  // Add mise paths (check for existing installs)
  const miseDir = `${HOME}/.local/share/mise/installs`
  try {
    if (fs.existsSync(miseDir)) {
      const tools = fs.readdirSync(miseDir)
      tools.forEach(tool => {
        const toolDir = `${miseDir}/${tool}`
        try {
          const versions = fs.readdirSync(toolDir)
          versions.forEach(v => paths.push(`${toolDir}/${v}/bin`))
        } catch {}
      })
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
  const startTime = Date.now()
  const T = () => `T+${Date.now() - startTime}ms`
  logTiming(`[gods] ${T()} createGodSession START for ${name}`)

  const godKey = name.toLowerCase()
  const sessionName = getSessionName(godKey)
  const god = PANTHEON[godKey] || { color: '#888', voice: 'emma' }
  const { resumeSessionId, startPrompt, personality = 'god' } = options

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
  let personalityTempFile = null
  let mcpConfigJson = null

  // Load and apply personality (if not resuming)
  // getComposedPrompt handles both legacy (MD) and trait-based (JSON) personalities
  logTiming(`[gods] ${T()} Loading personality...`)
  if (!resumeSessionId && personality && personality !== 'none') {
    const personalityContent = getComposedPrompt(personality)
    const projectsContent = getProjectsContext()

    // Combine personality and projects context
    let systemContent = ''
    if (personalityContent) {
      systemContent += personalityContent
    }
    if (projectsContent) {
      systemContent += '\n\n' + projectsContent
    }

    if (systemContent) {
      // Write to temp file - content has complex chars (backticks, code blocks)
      // that are hard to escape through multiple shell layers
      personalityTempFile = path.join(os.tmpdir(), `iris-personality-${godKey}-${Date.now()}.md`)
      fs.writeFileSync(personalityTempFile, systemContent)
    }

    // Get MCP config from personality
    const mcpConfig = getPersonalityMcpConfig(personality, IRIS_ROOT)
    if (mcpConfig) {
      mcpConfigJson = JSON.stringify(mcpConfig)
    }
  }

  // Build init prompt
  let initPrompt = ''
  if (!resumeSessionId) {
    if (startPrompt) {
      initPrompt += startPrompt + '\n\n'
    }
    if (task) {
      initPrompt += task
    }
  }

  try {
    logTiming(`[gods] ${T()} Personality loaded, building env...`)
    // Pass everything via environment variables - no shell escaping needed
    const zellijEnv = {
      ...process.env,
      PATH: getExtendedPath(),
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      GOD_NAME: name,
      IRIS_HOME: IRIS_ROOT,
      // Pass content via env vars - avoids all escaping issues
      IRIS_SESSION_ID: resumeSessionId || sessionId,
      IRIS_RESUME: resumeSessionId ? '1' : '',
      IRIS_TASK: initPrompt || '',
      IRIS_PERSONALITY: personalityTempFile ? fs.readFileSync(personalityTempFile, 'utf-8') : '',
      IRIS_MCP_CONFIG: mcpConfigJson || ''
    }

    // Use permanent launcher script - no escaping issues
    const launcherPath = path.join(__dirname, 'claude-launcher.cjs')

    // Create layout that runs the launcher
    const layoutFile = path.join(os.tmpdir(), `iris-layout-${godKey}-${Date.now()}.kdl`)
    const layoutContent = `layout {
    pane command="node" {
        args "${launcherPath}"
        cwd "${projectRoot}"
    }
}`
    fs.writeFileSync(layoutFile, layoutContent)

    // Create session with layout in background using shell subshell
    // This runs zellij detached from the parent process, creating session + command atomically
    // Capture errors to temp file for debugging
    const errorLogFile = path.join(os.tmpdir(), `iris-zellij-${godKey}-${Date.now()}.log`)
    // Use nohup + setsid (Linux) or just nohup (macOS) to fully detach zellij from the parent shell
    // This prevents the process from being killed when execSync's shell exits
    const detachPrefix = os.platform() === 'linux' ? 'setsid nohup' : 'nohup'
    const bgCmd = `${detachPrefix} "${ZELLIJ_BIN}" --config-dir "${ZELLIJ_CONFIG_DIR}" --session "${sessionName}" --new-session-with-layout "${layoutFile}" < /dev/null > "${errorLogFile}" 2>&1 &`
    logTiming(`[gods] ${T()} Spawning zellij: ${sessionName}`)
    try {
      execSync(bgCmd, {
        cwd: projectRoot,
        env: zellijEnv,
        shell: true
      })
      logTiming(`[gods] ${T()} execSync completed`)
    } catch (execErr) {
      console.error(`[gods] execSync FAILED:`, execErr.message)
      console.error(`[gods] execSync stderr:`, execErr.stderr?.toString())
      console.error(`[gods] execSync stdout:`, execErr.stdout?.toString())
      throw execErr
    }
    // Don't block waiting for session - attachPty() has async polling
    // Clean up layout file after a short delay (zellij reads it async)
    setTimeout(() => {
      try { fs.unlinkSync(layoutFile) } catch {}
      try { fs.unlinkSync(errorLogFile) } catch {}
    }, 2000)

    // Delayed cleanup of personality temp file
    // The $(cat ...) runs inside zellij pane asynchronously, so we wait
    if (personalityTempFile) {
      setTimeout(() => {
        try { fs.unlinkSync(personalityTempFile) } catch {}
      }, 5000)
    }

    logTiming(`[gods] ${T()} createGodSession DONE for ${name}`)
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
    // Clean up temp file on error (no async process started)
    if (personalityTempFile) {
      try { fs.unlinkSync(personalityTempFile) } catch {}
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
