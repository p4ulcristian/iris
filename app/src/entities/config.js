// Entity type icons and metadata - single source of truth
import claudeIcon from '../assets/icons/claude.svg'
import linearIcon from '../assets/icons/linear.png'
import gitIcon from '../assets/icons/git.svg'
import calendarIcon from '../assets/icons/google-calendar.svg'
import nvimIcon from '../assets/icons/neovim.svg'
import terminalIcon from '../assets/icons/terminal.svg'
import browserIcon from '../assets/icons/chrome.svg'
import vscodeIcon from '../assets/icons/vscode.svg'
import youtubeMusicIcon from '../assets/icons/youtube-music.svg'
import messengerIcon from '../assets/icons/messenger.svg'
import discordIcon from '../assets/icons/discord.svg'

export const ENTITY_TYPES = {
  god:      { label: 'God',      description: 'Divine worker',         icon: claudeIcon,  color: null },
  terminal: { label: 'Terminal', description: 'Raw shell session',    icon: terminalIcon, color: '#68D391' },
  browser:  { label: 'Browser',  description: 'Web browser',          icon: browserIcon, color: '#4285F4' },
  code:     { label: 'Code',     description: 'Code viewer',          icon: vscodeIcon,  color: '#007ACC' },
  git:      { label: 'Git',      description: 'Git repository view',  icon: gitIcon,     color: '#F05032' },
  nvim:     { label: 'Nvim',     description: 'Neovim editor',        icon: nvimIcon,    color: '#57A143' },
  linear:   { label: 'Linear',   description: 'Linear issues',        icon: linearIcon,  color: '#5E6AD2' },
  history:  { label: 'History',  description: 'Session history',      faIcon: 'faClockRotateLeft', color: '#8B5CF6' },
  cemetery: { label: 'Cemetery', description: 'Fallen gods',          faIcon: 'faSkull', color: '#1F2937' },
  settings: { label: 'Settings', description: 'App settings',         faIcon: 'faGear',  color: '#6B7280' },
  calendar: { label: 'Calendar', description: 'Calendar view',        icon: calendarIcon, color: '#4285F4' },
  oracle:   { label: 'Oracle',   description: 'Oracle assistant',     faIcon: 'faRobot', color: '#F59E0B' },
  'youtube-music': { label: 'YouTube Music', description: 'YouTube Music', icon: youtubeMusicIcon, color: '#FF0033' },
  messenger: { label: 'Messenger', description: 'Facebook Messenger', icon: messengerIcon, color: '#0099FF' },
  discord: { label: 'Discord', description: 'Discord', icon: discordIcon, color: '#5865F2' },
}

// List format for pickers/iteration
export const ENTITY_TYPE_LIST = Object.entries(ENTITY_TYPES).map(([type, cfg]) => ({ type, ...cfg }))

// Get entity color (falls back to gray for unknown types)
export const getEntityColor = (type) => ENTITY_TYPES[type]?.color || '#888888'
