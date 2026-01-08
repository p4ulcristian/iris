import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { PROJECT_LOGS_DIR, BACKEND_LOG } from './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Dev mode: when running from source (not packaged)
const isDev = !__dirname.includes('app.asar')

// Ensure logs directory exists (only in dev)
if (isDev && !fs.existsSync(PROJECT_LOGS_DIR)) {
  fs.mkdirSync(PROJECT_LOGS_DIR, { recursive: true })
}

// Format timestamp as [YYYY-MM-DD HH:MM:SS]
function timestamp() {
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

// Write to log file (only in dev)
function writeLog(component, message) {
  if (!isDev) return
  const line = `[${timestamp()}] [${component}] ${message}\n`
  fs.appendFileSync(BACKEND_LOG, line)
}

// Create logger for a specific component
export function createLogger(component) {
  return {
    log: (...args) => {
      const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
      writeLog(component, message)
      console.log(`[${component}]`, ...args)
    },
    error: (...args) => {
      const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
      writeLog(component, `ERROR: ${message}`)
      console.error(`[${component}]`, ...args)
    },
    warn: (...args) => {
      const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
      writeLog(component, `WARN: ${message}`)
      console.warn(`[${component}]`, ...args)
    }
  }
}

// Clear log file (call on startup, only in dev)
export function clearLog() {
  if (!isDev) return
  fs.writeFileSync(BACKEND_LOG, '')
}

// Default logger
export const log = createLogger('server')
