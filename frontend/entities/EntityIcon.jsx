import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTerminal, faClockRotateLeft, faGear, faSkull, faCalendar, faRobot, faDna, faBook, faFileLines, faPaintBrush, faClock, faListCheck } from '@fortawesome/free-solid-svg-icons'
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
  faFileLines,
  faPaintBrush,
  faClock,
  faListCheck,
}

export default function EntityIcon({ type, size = 'sm', className = '' }) {
  const config = ENTITY_TYPES[type]

  const sizeClasses = {
    sm: { img: 'w-4 h-4', fa: 'sm' },
    medium: { img: 'w-5 h-5', fa: 'lg' },
    large: { img: 'w-6 h-6', fa: 'xl' }
  }
  const { img: imgClass, fa: faSize } = sizeClasses[size] || sizeClasses.sm

  // Image-based icons
  if (config?.icon) {
    return <img src={config.icon} alt={config.label || type} className={`${imgClass} object-contain ${className}`} />
  }

  // FontAwesome icons
  if (config?.faIcon && FA_ICONS[config.faIcon]) {
    return <FontAwesomeIcon icon={FA_ICONS[config.faIcon]} size={faSize} className={`text-white/70 ${className}`} />
  }

  // Fallback for unknown types
  return <FontAwesomeIcon icon={faTerminal} size={faSize} className={`text-white/70 ${className}`} />
}
