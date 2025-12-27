import path from 'path'
import os from 'os'
import fs from 'fs'
import yaml from 'js-yaml'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const WS_PORT = 9999
export const OAUTH_PORT = 9998
export const DATA_DIR = path.join(os.homedir(), '.local/share/iris')
export const SOCKET_DIR = path.join(DATA_DIR, 'sockets')
export const STATE_FILE = path.join(DATA_DIR, 'state.json')
export const LOGS_DIR = path.join(DATA_DIR, 'logs')

export const SERVICES = {
  speak: { port: 8765, name: 'Speak', icon: '🔊', script: 'brain/speak/server.py' },
  hear: { port: 8766, name: 'Hear', icon: '👂', script: 'brain/hear/server.py' },
  express: { port: 8767, name: 'Express', icon: '💬', script: 'brain/express/server.py' },
  wake: { port: null, name: 'Wake', icon: '⌨️', script: 'brain/wake/listener.py' }
}

// Load pantheon from YAML (single source of truth)
const pantheonPath = path.join(__dirname, '../../prompts/pantheon.yaml')
const pantheonYaml = yaml.load(fs.readFileSync(pantheonPath, 'utf-8'))

// Build PANTHEON object from YAML (exclude 'realms' key)
export const PANTHEON = Object.fromEntries(
  Object.entries(pantheonYaml)
    .filter(([key]) => key !== 'realms')
    .map(([name, data]) => [name, { color: data.color, voice: data.voice }])
)

// Build REALMS array from YAML
export const REALMS = pantheonYaml.realms || []
