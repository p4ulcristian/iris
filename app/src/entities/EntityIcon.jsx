import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTerminal, faClockRotateLeft, faGear, faSkull, faCalendar, faRobot, faDna, faBook } from '@fortawesome/free-solid-svg-icons'
import { ENTITY_TYPES } from './config'

// Map faIcon string names to actual FontAwesome icons
const FA_ICONS = {
  faTerminal,
  faClockRotateLeft,
  faGear,
  faSkull,
  faCalendar,
  faRobot,
  faDna,
  faBook,
}

export default function EntityIcon({ type, size = 'sm', className = '' }) {
  const config = ENTITY_TYPES[type] || ENTITY_TYPES.terminal

  const imgClass = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'
  const faSize = size === 'sm' ? 'sm' : 'lg'

  // Image-based icons (linear, git, nvim, browser, code)
  if (config.icon) {
    return <img src={config.icon} alt={config.label} className={`${imgClass} object-contain ${className}`} />
  }

  // FontAwesome icons (god, terminal, history, settings, cemetery, calendar, oracle)
  if (config.faIcon && FA_ICONS[config.faIcon]) {
    return <FontAwesomeIcon icon={FA_ICONS[config.faIcon]} size={faSize} className={`text-white/70 ${className}`} />
  }

  // Fallback
  return <FontAwesomeIcon icon={faTerminal} size={faSize} className={`text-white/70 ${className}`} />
}
