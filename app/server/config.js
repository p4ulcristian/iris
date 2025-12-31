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
    ares: { voice: 'ares', color: '#FF3366' },
    artemis: { voice: 'artemis', color: '#00FF88' },
    poseidon: { voice: 'poseidon', color: '#0088FF' },
    hermes: { voice: 'hermes', color: '#00DDFF' },
    hera: { voice: 'hera', color: '#FF44AA' },
    hephaestus: { voice: 'hephaestus', color: '#FF6622' },
    dionysus: { voice: 'dionysus', color: '#AA44FF' },
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
