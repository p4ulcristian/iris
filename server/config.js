import path from 'path'
import os from 'os'
import fs from 'fs'
import { fileURLToPath } from 'url'
import ports from '../ports.json' with { type: 'json' }

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Ports - source of truth is ports.json
export const VITE_PORT = ports.vite
export const WS_PORT = ports.ws
export const OAUTH_PORT = ports.oauth
export const SPEAK_PORT = ports.speak
export const HEAR_PORT = ports.hear

// Cross-platform data directory
function getDataDir() {
  const platform = os.platform()
  const home = os.homedir()

  if (platform === 'darwin') {
    return path.join(home, 'Library/Application Support/iris')
  } else if (platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData/Roaming'), 'iris')
  } else {
    // Linux and others
    return path.join(home, '.local/share/iris')
  }
}

export const DATA_DIR = getDataDir()
export const SOCKET_DIR = path.join(DATA_DIR, 'sockets')
export const STATE_FILE = path.join(DATA_DIR, 'state.json')
export const LOGS_DIR = path.join(DATA_DIR, 'logs')

// Project root and unified logs
function getProjectRoot() {
  // In dev: __dirname is ~/Work/iris/server
  // In packaged: __dirname includes app.asar.unpacked
  if (__dirname.includes('app.asar.unpacked')) {
    // Packaged app - use DATA_DIR for logs
    return DATA_DIR
  }
  // Development mode - project root is 1 level up from server
  return path.join(__dirname, '..')
}

export const PROJECT_ROOT = getProjectRoot()
export const PROJECT_LOGS_DIR = path.join(PROJECT_ROOT, 'logs')
export const BACKEND_LOG = path.join(PROJECT_LOGS_DIR, 'backend.txt')
export const FRONTEND_LOG = path.join(PROJECT_LOGS_DIR, 'frontend.txt')

// Zellij config directory (bundled with app)
function getZellijConfigDir() {
  // Check if running from packaged app (server is in app.asar.unpacked)
  if (__dirname.includes('app.asar.unpacked')) {
    const resourcesDir = path.join(__dirname, '..', '..')
    const bundled = path.join(resourcesDir, 'zellij')
    if (fs.existsSync(bundled)) {
      return bundled
    }
  }
  // Development mode - use resources folder
  return path.join(__dirname, '../resources/zellij')
}
export const ZELLIJ_CONFIG_DIR = getZellijConfigDir()

// Zellij binary path (bundled with app or system)
function getZellijBin() {
  // Check if running from packaged app (server is in app.asar.unpacked)
  // __dirname = .../Resources/app.asar.unpacked/server
  // zellij is at .../Resources/zellij/bin/zellij
  if (__dirname.includes('app.asar.unpacked')) {
    const resourcesDir = path.join(__dirname, '..', '..')  // Up to Resources
    const bundled = path.join(resourcesDir, 'zellij', 'bin', 'zellij')
    if (fs.existsSync(bundled)) {
      return bundled
    }
  }
  // Development mode - check platform-specific binary
  const platform = os.platform() === 'darwin' ? 'mac' : 'linux'
  const arch = os.arch() === 'arm64' ? 'arm64' : 'x64'
  const devBin = path.join(__dirname, '../resources/zellij/bin', `${platform}-${arch}`, 'zellij')
  if (fs.existsSync(devBin)) {
    return devBin
  }
  // Fall back to system zellij
  return 'zellij'
}
export const ZELLIJ_BIN = getZellijBin()

// Personalities directory (bundled with app)
function getPersonalitiesDir() {
  // Check if running from packaged app (server is in app.asar.unpacked)
  if (__dirname.includes('app.asar.unpacked')) {
    const resourcesDir = path.join(__dirname, '..', '..')
    const bundled = path.join(resourcesDir, 'personalities')
    if (fs.existsSync(bundled)) {
      return bundled
    }
  }
  // Development mode - use resources folder
  return path.join(__dirname, '../resources/personalities')
}
export const PERSONALITIES_DIR = getPersonalitiesDir()

// Traits directory (bundled with app)
function getTraitsDir() {
  // Check if running from packaged app (server is in app.asar.unpacked)
  if (__dirname.includes('app.asar.unpacked')) {
    const resourcesDir = path.join(__dirname, '..', '..')
    const bundled = path.join(resourcesDir, 'traits')
    if (fs.existsSync(bundled)) {
      return bundled
    }
  }
  // Development mode - use resources folder
  return path.join(__dirname, '../resources/traits')
}
export const TRAITS_DIR = getTraitsDir()

// MCP Servers directory (bundled with app)
function getMcpServersDir() {
  // Check if running from packaged app (server is in app.asar.unpacked)
  if (__dirname.includes('app.asar.unpacked')) {
    const resourcesDir = path.join(__dirname, '..', '..')
    const bundled = path.join(resourcesDir, 'mcp-servers')
    if (fs.existsSync(bundled)) {
      return bundled
    }
  }
  // Development mode - use resources folder
  return path.join(__dirname, '../resources/mcp-servers')
}
export const MCP_SERVERS_DIR = getMcpServersDir()

export const SERVICES = {
  speak: { port: SPEAK_PORT, name: 'Speak', icon: '🔊', script: 'powers/speak/server.py' },
  hear: { port: HEAR_PORT, name: 'Hear', icon: '👂', script: 'powers/hear/server.py' }
}

// Pantheon configuration
export const PANTHEON = {
  // Female
  nyx: { voice: 'nyx', color: '#AA00FF' },
  selene: { voice: 'selene', color: '#00FFCC' },
  hera: { voice: 'hera', color: '#FF00AA' },
  athena: { voice: 'athena', color: '#00FF88' },
  // Male
  prometheus: { voice: 'prometheus', color: '#FF6600' },
  morpheus: { voice: 'morpheus', color: '#FF2222' },
  poseidon: { voice: 'poseidon', color: '#0055FF' },
  zeus: { voice: 'zeus', color: '#FFCC00' }
}

export const REALM_COLORS = {
  Olympus: '#FFCC00',
  Tartarus: '#FF3366',
  Grove: '#00FF88',
  Styx: '#0088FF',
  Agora: '#00DDFF',
  Temple: '#FF44AA',
  Forge: '#FF6622',
  Elysium: '#AA44FF'
}

export const REALMS = Object.keys(REALM_COLORS)

export const GOD_COLORS = Object.fromEntries(
  Object.entries(PANTHEON).map(([name, data]) => [name, data.color])
)

// God spawn defaults
export const DEFAULT_PERMISSION_MODE = 'bypass-plan'
