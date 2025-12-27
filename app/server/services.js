import http from 'http'
import fs from 'fs'
import { spawn, execSync } from 'child_process'
import { SERVICES } from './config.js'

const DEBUG_LOG = '/tmp/iris-debug.log'
function debugLog(msg) {
  fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${msg}\n`)
}

// Broadcast function - set by index.js
let broadcastFn = null

export function setBroadcast(fn) {
  broadcastFn = fn
  debugLog('setBroadcast called - server is running with new code')
}

// Service status
export const serviceStatus = {
  speak: false,
  hear: false,
  express: false,
  wake: false
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
    checkServiceHealth('wake', SERVICES.wake.port)
  ])

  const changed = (
    serviceStatus.speak !== results[0] ||
    serviceStatus.hear !== results[1] ||
    serviceStatus.express !== results[2] ||
    serviceStatus.wake !== results[3]
  )

  serviceStatus.speak = results[0]
  serviceStatus.hear = results[1]
  serviceStatus.express = results[2]
  serviceStatus.wake = results[3]

  if (changed) {
    debugLog(`Status changed: ${JSON.stringify(serviceStatus)}`)
    if (broadcastFn) {
      debugLog('Broadcasting services:status')
      broadcastFn('services:status', { services: serviceStatus })
    } else {
      debugLog('WARNING: broadcastFn is not set!')
    }
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
  debugLog(`startService called for: ${name}`)

  // Check if we think it's running, but verify PID is still alive
  if (serviceProcesses[name]) {
    try {
      process.kill(serviceProcesses[name], 0)  // Signal 0 = check if alive
      debugLog(`Service ${name} already running (pid ${serviceProcesses[name]})`)
      return
    } catch {
      // Process is dead, clean up and continue
      debugLog(`Service ${name} pid ${serviceProcesses[name]} is dead, restarting`)
      delete serviceProcesses[name]
    }
  }

  const script = SERVICES[name]?.script
  if (!script) {
    debugLog(`startService: no script found for ${name}`)
    return
  }

  const scriptPath = `${projectRoot}/${script}`
  const uvPath = process.env.HOME + '/.local/bin/uv'

  debugLog(`Starting ${name}: ${uvPath} run --script ${scriptPath}`)

  const proc = spawn(uvPath, ['run', '--script', scriptPath], {
    cwd: projectRoot,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      CUDA_VISIBLE_DEVICES: '0'
    }
  })

  proc.on('error', (err) => {
    debugLog(`Failed to start ${name}: ${err.message}`)
    delete serviceProcesses[name]
  })

  proc.unref()
  serviceProcesses[name] = proc.pid
  debugLog(`Started ${name} with pid ${proc.pid}`)

  setTimeout(() => checkAllServices(), 2000)
}

export function stopService(name) {
  debugLog(`stopService called for: ${name}`)

  const pid = serviceProcesses[name]
  if (pid) {
    try {
      process.kill(pid, 'SIGTERM')
      debugLog(`Killed ${name} by pid ${pid}`)
    } catch (e) {
      debugLog(`Failed to kill ${name} by pid: ${e.message}`)
    }
    delete serviceProcesses[name]
  }

  // Also try to kill by port
  const port = SERVICES[name]?.port
  if (port) {
    try {
      execSync(`lsof -ti:${port} | xargs -r kill`, { stdio: 'ignore' })
      debugLog(`Killed ${name} by port ${port}`)
    } catch (e) {}
  }

  // Also kill by script name (catches zombies not listening on port)
  const script = SERVICES[name]?.script
  if (script) {
    try {
      execSync(`pkill -f "${script}"`, { stdio: 'ignore' })
      debugLog(`Killed ${name} by script name`)
    } catch (e) {}
  }

  debugLog(`stopService scheduling checkAllServices in 500ms`)
  setTimeout(() => checkAllServices(), 500)
}
