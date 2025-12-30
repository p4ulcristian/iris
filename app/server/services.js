import http from 'http'
import { spawn, execSync } from 'child_process'
import { SERVICES } from './config.js'

// Broadcast function - set by index.js
let broadcastFn = null

export function setBroadcast(fn) {
  broadcastFn = fn
}

// Service status
export const serviceStatus = {
  speak: false,
  hear: false,
  express: false,
  wake: false,
  ollama: false
}

// Service processes we've started
const serviceProcesses = {}

let healthCheckInterval = null

async function checkServiceHealth(name, port) {
  // For services without a port, check if process is running
  if (!port) {
    return new Promise((resolve) => {
      const script = SERVICES[name]?.script
      if (!script) return resolve(false)
      try {
        execSync(`pgrep -f "${script}"`, { stdio: 'ignore' })
        resolve(true)
      } catch {
        resolve(false)
      }
    })
  }

  // For Ollama, check /api/tags instead of /health
  if (name === 'ollama') {
    return new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${port}/api/tags`, { timeout: 1000 }, (res) => {
        resolve(res.statusCode === 200)
      })
      req.on('error', () => resolve(false))
      req.on('timeout', () => { req.destroy(); resolve(false) })
    })
  }

  // For HTTP services, check health endpoint
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 1000 }, (res) => {
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

export async function checkAllServices() {
  const results = await Promise.all([
    checkServiceHealth('speak', SERVICES.speak.port),
    checkServiceHealth('hear', SERVICES.hear.port),
    checkServiceHealth('express', SERVICES.express.port),
    checkServiceHealth('wake', SERVICES.wake.port),
    checkServiceHealth('ollama', SERVICES.ollama.port)
  ])

  const changed = (
    serviceStatus.speak !== results[0] ||
    serviceStatus.hear !== results[1] ||
    serviceStatus.express !== results[2] ||
    serviceStatus.wake !== results[3] ||
    serviceStatus.ollama !== results[4]
  )

  serviceStatus.speak = results[0]
  serviceStatus.hear = results[1]
  serviceStatus.express = results[2]
  serviceStatus.wake = results[3]
  serviceStatus.ollama = results[4]

  if (changed && broadcastFn) {
    broadcastFn('services:status', { services: serviceStatus })
  }
}

export function startHealthChecks() {
  checkAllServices()
  healthCheckInterval = setInterval(checkAllServices, 3000)
}

export function stopHealthChecks() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval)
    healthCheckInterval = null
  }
}

export function startService(name, projectRoot) {
  // Check if we think it's running, but verify PID is still alive
  if (serviceProcesses[name]) {
    try {
      process.kill(serviceProcesses[name], 0)  // Signal 0 = check if alive
      return
    } catch {
      // Process is dead, clean up and continue
      delete serviceProcesses[name]
    }
  }

  const script = SERVICES[name]?.script
  if (!script) return

  let proc

  try {
    // Ollama is a direct command, not a uv script
    // Use setsid to create independent session that survives parent exit
    if (name === 'ollama') {
      proc = spawn('setsid', ['ollama', 'serve'], {
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          CUDA_VISIBLE_DEVICES: '0',
          OLLAMA_ORIGINS: '*'  // Allow CORS for browser/Electron access
        }
      })
    } else {
      const scriptPath = `${projectRoot}/${script}`
      const uvPath = process.env.HOME + '/.local/bin/uv'

      proc = spawn('setsid', [uvPath, 'run', '--script', scriptPath], {
        cwd: projectRoot,
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          CUDA_VISIBLE_DEVICES: '0'
        }
      })
    }

    proc.on('error', (err) => {
      console.error(`Service ${name} spawn error:`, err.message)
      delete serviceProcesses[name]
    })

    proc.unref()
    serviceProcesses[name] = proc.pid
  } catch (err) {
    console.error(`Failed to start service ${name}:`, err.message)
    return
  }

  setTimeout(() => checkAllServices(), 2000)
}

export function stopService(name) {
  const pid = serviceProcesses[name]
  if (pid) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {}
    delete serviceProcesses[name]
  }

  // Kill by port (only LISTENING processes, not connections TO the port)
  const port = SERVICES[name]?.port
  if (port) {
    try {
      execSync(`lsof -ti:${port} -sTCP:LISTEN | xargs -r kill`, { stdio: 'ignore' })
    } catch {}
  }

  // Kill by script name (catches zombies not listening on port)
  const script = SERVICES[name]?.script
  if (script) {
    try {
      execSync(`pkill -f "${script}"`, { stdio: 'ignore' })
    } catch {}
  }

  setTimeout(() => checkAllServices(), 500)
}
