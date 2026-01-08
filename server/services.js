import http from 'http'
import { spawn, execSync } from 'child_process'
import { SERVICES } from './config.js'
import { isPowersEnabled } from './state.js'
import { createLogger } from './logger.js'

const log = createLogger('services')

// Broadcast function - set by index.js
let broadcastFn = null

export function setBroadcast(fn) {
  broadcastFn = fn
}

// Service status
export const serviceStatus = {
  speak: false,
  hear: false,
  chronicle: false
}

// Service processes we've started
const serviceProcesses = {}

let healthCheckInterval = null

async function checkChronicleStatus() {
  // Only check chronicle if hear is running
  if (!serviceStatus.hear) {
    return false
  }

  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${SERVICES.hear.port}/chronicle/status`, { timeout: 1000 }, (res) => {
      if (res.statusCode === 200) {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          try {
            const status = JSON.parse(data)
            resolve(status.running === true)
          } catch {
            resolve(false)
          }
        })
      } else {
        resolve(false)
      }
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

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
  // Skip health checks if powers are disabled
  if (!isPowersEnabled()) {
    return
  }

  const results = await Promise.all([
    checkServiceHealth('speak', SERVICES.speak.port),
    checkServiceHealth('hear', SERVICES.hear.port)
  ])

  serviceStatus.speak = results[0]
  serviceStatus.hear = results[1]

  // Check chronicle status (depends on hear being up)
  const chronicleStatus = await checkChronicleStatus()

  const changed = (
    serviceStatus.speak !== results[0] ||
    serviceStatus.hear !== results[1] ||
    serviceStatus.chronicle !== chronicleStatus
  )

  serviceStatus.chronicle = chronicleStatus

  if (changed && broadcastFn) {
    broadcastFn('services:status', { services: serviceStatus })
  }
}

export function startHealthChecks() {
  // Skip if powers are disabled
  if (!isPowersEnabled()) {
    return
  }
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
  log.log(`startService called: ${name}, projectRoot: ${projectRoot}`)

  // Check if we think it's running, but verify PID is still alive
  if (serviceProcesses[name]) {
    try {
      process.kill(serviceProcesses[name], 0)  // Signal 0 = check if alive
      log.log(`Service ${name} already running with PID ${serviceProcesses[name]}`)
      return
    } catch {
      // Process is dead, clean up and continue
      log.log(`Service ${name} PID ${serviceProcesses[name]} is dead, cleaning up`)
      delete serviceProcesses[name]
    }
  }

  const script = SERVICES[name]?.script
  if (!script) {
    log.error(`No script configured for service: ${name}`)
    return
  }

  let proc

  try {
    const scriptPath = `${projectRoot}/${script}`
    const uvPath = process.env.HOME + '/.local/bin/uv'
    log.log(`Starting ${name}: uv run --script ${scriptPath}`)

    proc = spawn('setsid', [uvPath, 'run', '--script', scriptPath], {
      cwd: projectRoot,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        CUDA_VISIBLE_DEVICES: '0'
      }
    })

    proc.on('error', (err) => {
      log.error(`Service ${name} spawn error:`, err.message)
      delete serviceProcesses[name]
    })

    proc.unref()
    serviceProcesses[name] = proc.pid
  } catch (err) {
    log.error(`Failed to start service ${name}:`, err.message)
    return
  }

  setTimeout(() => checkAllServices(), 2000)
}

export async function stopService(name) {
  // Try graceful shutdown via HTTP first
  const port = SERVICES[name]?.port
  if (port) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port,
          path: '/shutdown',
          method: 'POST',
          timeout: 2000
        }, (res) => {
          resolve(res.statusCode === 200)
        })
        req.on('error', () => resolve(false))
        req.on('timeout', () => { req.destroy(); resolve(false) })
        req.end()
      })
      log.log(`Sent shutdown to ${name}`)
      // Give it a moment to cleanup
      await new Promise(r => setTimeout(r, 1000))
    } catch (e) {
      log.warn(`Graceful shutdown failed for ${name}: ${e.message}`)
    }
  }

  // Clean up tracked PID
  const pid = serviceProcesses[name]
  if (pid) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {}
    delete serviceProcesses[name]
  }

  // Force kill by script name as fallback
  const script = SERVICES[name]?.script
  if (script) {
    try {
      execSync(`pkill -f "${script}"`, { stdio: 'ignore' })
    } catch {}
  }

  setTimeout(() => checkAllServices(), 500)
}

export function startChronicle() {
  // Chronicle is a mode within hear, not a separate service
  const port = SERVICES.hear.port
  const req = http.request({
    hostname: '127.0.0.1',
    port,
    path: '/chronicle/start',
    method: 'POST',
    timeout: 2000
  }, (res) => {
    if (res.statusCode === 200) {
      setTimeout(() => checkAllServices(), 500)
    }
  })
  req.on('error', () => {})
  req.end()
}

export function stopChronicle() {
  // Chronicle is a mode within hear, not a separate service
  const port = SERVICES.hear.port
  const req = http.request({
    hostname: '127.0.0.1',
    port,
    path: '/chronicle/stop',
    method: 'POST',
    timeout: 2000
  }, (res) => {
    if (res.statusCode === 200) {
      setTimeout(() => checkAllServices(), 500)
    }
  })
  req.on('error', () => {})
  req.end()
}
