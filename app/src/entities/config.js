// Entity type icons and metadata - single source of truth
import claudeIcon from '../assets/icons/claude.svg'
import linearIcon from '../assets/icons/linear.png'
import gitIcon from '../assets/icons/git.svg'
import calendarIcon from '../assets/icons/google-calendar.svg'
import terminalIcon from '../assets/icons/terminal.svg'
import browserIcon from '../assets/icons/chrome.svg'
import vscodeIcon from '../assets/icons/vscode.svg'
import youtubeMusicIcon from '../assets/icons/youtube-music.svg'

export const ENTITY_TYPES = {
  god:      { label: 'God',      description: 'Divine worker',         icon: claudeIcon,  color: null },
  terminal: { label: 'Terminal', description: 'Raw shell session',    icon: terminalIcon, color: '#68D391' },
  browser:  { label: 'Browser',  description: 'Web browser',          icon: browserIcon, color: '#4285F4' },
  code:     { label: 'Code',     description: 'Code viewer',          icon: vscodeIcon,  color: '#007ACC' },
  git:      { label: 'Git',      description: 'Git repository view',  icon: gitIcon,     color: '#F05032' },
  linear:   { label: 'Linear',   description: 'Linear issues',        icon: linearIcon,  color: '#5E6AD2' },
  history:  { label: 'History',  description: 'Session history',      faIcon: 'faClockRotateLeft', color: '#8B5CF6' },
  cemetery: { label: 'Cemetery', description: 'Fallen gods',          faIcon: 'faSkull', color: '#1F2937' },
  settings: { label: 'Settings', description: 'App settings',         faIcon: 'faGear',  color: '#6B7280' },
  calendar: { label: 'Calendar', description: 'Calendar view',        icon: calendarIcon, color: '#4285F4' },
  oracle:   { label: 'Oracle',   description: 'Oracle assistant',     faIcon: 'faRobot', color: '#F59E0B' },
  personalities: { label: 'Personalities', description: 'Manage Claude personalities', faIcon: 'faDna', color: '#AA44FF' },
  'youtube-music': { label: 'YouTube Music', description: 'YouTube Music', icon: youtubeMusicIcon, color: '#FF0033' },
  rsvp: { label: 'RSVP', description: 'Speed reader', faIcon: 'faBook', color: '#10B981' },
  markdown: { label: 'Markdown', description: 'Markdown viewer', faIcon: 'faFileLines', color: '#89b4fa' },
  draw: { label: 'Draw', description: 'StarVector SVG generator', faIcon: 'faPaintBrush', color: '#9333EA' },
  pomodoro: { label: 'Pomodoro', description: 'Focus timer', faIcon: 'faClock', color: '#EF4444' },
  todo: { label: 'Todo', description: 'Task list', faIcon: 'faListCheck', color: '#22C55E' },
}

// List format for pickers/iteration
export const ENTITY_TYPE_LIST = Object.entries(ENTITY_TYPES).map(([type, cfg]) => ({ type, ...cfg }))

// Get entity color (falls back to gray for unknown types)
export const getEntityColor = (type) => ENTITY_TYPES[type]?.color || '#888888'
