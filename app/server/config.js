import path from 'path'
import os from 'os'
import fs from 'fs'
import yaml from 'js-yaml'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const WS_PORT = 9999
export const OAUTH_PORT = 9998

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
  speak: { port: 8765, name: 'Speak', icon: '🔊', script: 'brain/speak/server.py' },
  hear: { port: 8766, name: 'Hear', icon: '👂', script: 'brain/hear/server.py' },
  express: { port: 8767, name: 'Express', icon: '💬', script: 'brain/express/server.py' },
  wake: { port: null, name: 'Wake', icon: '⌨️', script: 'brain/wake/listener.py' },
  ollama: { port: 11434, name: 'Ollama', icon: '🧠', script: 'ollama serve' }
}

// Load pantheon from YAML (single source of truth)
const pantheonPath = path.join(__dirname, '../../prompts/pantheon.yaml')
let pantheonYaml = {}
try {
  pantheonYaml = yaml.load(fs.readFileSync(pantheonPath, 'utf-8'))
} catch (e) {
  // Fallback for packaged app where prompts/ might not exist
  pantheonYaml = {
    zeus: { voice: 'zeus', color: '#FFCC00' },
    ares: { voice: 'ares', color: '#FF2222' },
    artemis: { voice: 'artemis', color: '#00FF88' },
    poseidon: { voice: 'poseidon', color: '#0055FF' },
    hermes: { voice: 'hermes', color: '#00FFCC' },
    hera: { voice: 'hera', color: '#FF00AA' },
    hephaestus: { voice: 'hephaestus', color: '#FF6600' },
    dionysus: { voice: 'dionysus', color: '#AA00FF' },
    realms: {
      Olympus: '#FFCC00',
      Tartarus: '#FF3366',
      Grove: '#00FF88',
      Styx: '#0088FF',
      Agora: '#00DDFF',
      Temple: '#FF44AA',
      Forge: '#FF6622',
      Elysium: '#AA44FF'
    }
  }
}

// Build PANTHEON object from YAML (exclude 'realms' key)
export const PANTHEON = Object.fromEntries(
  Object.entries(pantheonYaml)
    .filter(([key]) => key !== 'realms')
    .map(([name, data]) => [name, { color: data.color, voice: data.voice }])
)

// Build REALMS array and REALM_COLORS from YAML
const realmsData = pantheonYaml.realms || {}
export const REALMS = Object.keys(realmsData)
export const REALM_COLORS = realmsData

// Build GOD_COLORS from PANTHEON (for client broadcast)
export const GOD_COLORS = Object.fromEntries(
  Object.entries(PANTHEON).map(([name, data]) => [name, data.color])
)
