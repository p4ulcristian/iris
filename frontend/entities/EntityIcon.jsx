import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTerminal, faClockRotateLeft, faGear, faSkull, faCalendar, faRobot, faDna, faBook, faFileLines, faPaintBrush, faClock, faListCheck } from '@fortawesome/free-solid-svg-icons'
import { useStore } from '@/store'

// Auto-import all icons from entities
const iconModules = import.meta.glob(
  '../../entities/*/icon.{svg,png}',
  { eager: true, import: 'default' }
)

// Build map: { browser: '/path/to/icon.svg', ... }
const ICONS = Object.fromEntries(
  Object.entries(iconModules).map(([path, src]) => [
    path.split('/').at(-2), // entities/{type}/icon.svg → type
    src
  ])
)

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
  const entityRegistry = useStore(s => s.entityRegistry)
  const config = entityRegistry[type]
  const icon = ICONS[type]

  const sizeClasses = {
    sm: { img: 'w-4 h-4', fa: 'sm' },
    medium: { img: 'w-5 h-5', fa: 'lg' },
    large: { img: 'w-6 h-6', fa: 'xl' }
  }
  const { img: imgClass, fa: faSize } = sizeClasses[size] || sizeClasses.sm

  // Image-based icons (from entities folder)
  if (icon) {
    return <img src={icon} alt={config?.label || type} className={`${imgClass} object-contain ${className}`} />
  }

  // FontAwesome icons (from registry)
  if (config?.faIcon && FA_ICONS[config.faIcon]) {
    return <FontAwesomeIcon icon={FA_ICONS[config.faIcon]} size={faSize} className={`text-white/70 ${className}`} />
  }

  // Fallback for unknown types
  return <FontAwesomeIcon icon={faTerminal} size={faSize} className={`text-white/70 ${className}`} />
}
