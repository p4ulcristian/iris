import path from 'path'
import os from 'os'

export const WS_PORT = 9999
export const SOCKET_DIR = path.join(os.homedir(), '.local/share/iris/sockets')
export const STATE_FILE = path.join(os.homedir(), '.local/share/iris/state.json')

export const SERVICES = {
  speak: { port: 8765, name: 'Speak', icon: '🔊', script: 'brain/speak/server.py' },
  hear: { port: 8766, name: 'Hear', icon: '👂', script: 'brain/hear/server.py' },
  express: { port: 8767, name: 'Express', icon: '💬', script: 'brain/express/server.py' },
  wake: { port: null, name: 'Wake', icon: '⌨️', script: 'brain/wake/listener.py' }
}

export const PANTHEON = {
  zeus:       { color: '#ffd700', voice: 'zeus' },
  apollo:     { color: '#ffeb3b', voice: 'apollo' },
  artemis:    { color: '#009688', voice: 'artemis' },
  athena:     { color: '#2196f3', voice: 'athena' },
  hermes:     { color: '#ff9800', voice: 'hermes' },
  hades:      { color: '#9c27b0', voice: 'hades' },
  poseidon:   { color: '#00bcd4', voice: 'poseidon' },
  hera:       { color: '#e91e63', voice: 'hera' },
  ares:       { color: '#f44336', voice: 'ares' },
  hephaestus: { color: '#cd7f32', voice: 'hephaestus' },
  aphrodite:  { color: '#ff6b9d', voice: 'aphrodite' },
  dionysus:   { color: '#7c4dff', voice: 'dionysus' },
  demeter:    { color: '#4caf50', voice: 'demeter' }
}
