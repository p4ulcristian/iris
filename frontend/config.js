// Server URLs - dynamic based on environment
const isElectron = typeof window !== 'undefined' && !!window.iris

// In Electron: use localhost
// In browser: derive from current host (for cloud deployment)
function getServerHost() {
  if (isElectron) return 'localhost'
  if (typeof window === 'undefined') return 'localhost'
  return window.location.hostname || 'localhost'
}

function getWsProtocol() {
  if (isElectron) return 'ws:'
  if (typeof window === 'undefined') return 'ws:'
  return window.location.protocol === 'https:' ? 'wss:' : 'ws:'
}

const host = getServerHost()
const wsProtocol = getWsProtocol()

export const WS_URL = `${wsProtocol}//${host}:9999`
export const API_URL = `http://${host}:9998` // Keep for OAuth callback only
export const CHRONICLE_URL = `http://${host}:8766`

// WebSocket Events
export const EVENTS = {
  // God management
  GOD_SPAWN: 'god:spawn',

  // Entity management
  ENTITY_KILL: 'entity:kill',
  ENTITY_SPAWN: 'entity:spawn',
  ENTITY_MOVE: 'entity:move',
  ENTITY_MOVE_TO_NEW_TAB: 'entity:move-to-new-tab',
  ENTITY_SET_TITLE: 'entity:set-title',
  ENTITIES_REORDER: 'entities:reorder',

  // Terminal
  TERMINAL_SPAWN: 'terminal:spawn',
  PTY_ATTACH: 'pty:attach',
  PTY_INPUT: 'pty:input',
  PTY_RESIZE: 'pty:resize',

  // Focus
  FOCUS_SET: 'focus:set',
  FOCUS_PREV: 'focus:prev',
  FOCUS_NEXT: 'focus:next',

  // Tabs
  TAB_ADD: 'tab:add',
  TAB_SELECT: 'tab:select',
  TAB_REMOVE: 'tab:remove',

  // Layout
  LAYOUT_INIT: 'layout:init',
  LAYOUT_RESIZE: 'layout:resize',
  STAGE_SPLIT: 'stage:split',
  STAGES_REORDER: 'stages:reorder',

  // Git
  GIT_STATUS: 'git:status',
  GIT_STATUS_RESPONSE: 'git:status:response',

  // Settings
  THEME_SET: 'theme:set',
  SETTINGS_UPDATE: 'settings:update',

  // Calendar
  CALENDAR_AUTH_START: 'calendar:auth:start',
  CALENDAR_DISCONNECT: 'calendar:disconnect',

  // Personalities & traits
  PERSONALITIES_LIST: 'personalities:list',
  TRAITS_LIST: 'traits:list',
  MCP_SERVERS_LIST: 'mcp-servers:list',
  PROJECTS_LIST: 'projects:list',
  PROJECTS_GET: 'projects:get',
  PROJECTS_SAVE: 'projects:save',

  // Code
  CODE_FILES_SYNC: 'code:files:sync',

  // Error reporting
  ERROR_REPORT: 'error:report',
}
