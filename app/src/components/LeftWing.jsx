import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCircle,
  faKeyboard,
  faEarListen,
  faVolumeHigh,
  faCommentDots,
  faChevronDown,
  faXmark,
  faPlus,
  faBolt,
  faSun,
  faSkull,
  faScaleBalanced,
  faHammer,
  faTree,
  faWater,
  faBuildingColumns,
  faCity,
  faWineGlass,
  faCompass,
  faEye,
  faBrain
} from '@fortawesome/free-solid-svg-icons'

const REALM_ICONS = {
  'Olympus': faBolt,
  'Elysium': faSun,
  'Tartarus': faSkull,
  'Agora': faScaleBalanced,
  'Forge': faHammer,
  'Grove': faTree,
  'Styx': faWater,
  'Temple': faBuildingColumns,
  'Acropolis': faCity,
  'Nectar Hall': faWineGlass,
  'Labyrinth': faCompass,
  'Oracle': faEye
}

function Spinner() {
  return (
    <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
  )
}

function ServicesDropdown({ connected, services, servicesLoading, onToggle }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  // Close menu when clicking outside
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const serviceList = [
    { name: 'Wake', key: 'wake', icon: faKeyboard },
    { name: 'Hear', key: 'hear', icon: faEarListen },
    { name: 'Speak', key: 'speak', icon: faVolumeHigh },
    { name: 'Express', key: 'express', icon: faCommentDots },
    { name: 'Ollama', key: 'ollama', icon: faBrain },
  ]

  const activeCount = serviceList.filter(s => services[s.key]).length

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 flex items-center justify-center liquid-glass-pill liquid-glass-text-muted transition-all"
        title={`Services (${activeCount}/${serviceList.length})`}
      >
        <FontAwesomeIcon
          icon={faCircle}
          className={`text-[8px] ${connected ? 'text-green-500' : 'text-red-500'}`}
        />
      </button>

      {open && (
        <div className="absolute left-full bottom-0 ml-1 min-w-[160px] liquid-glass rounded-lg shadow-lg py-1 z-50">
          {serviceList.map((service) => {
            const isActive = services[service.key]
            const isLoading = servicesLoading[service.key]

            return (
              <button
                key={service.key}
                onClick={() => !isLoading && onToggle(service.key, isActive)}
                disabled={isLoading}
                className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 transition-all ${
                  isLoading
                    ? 'text-yellow-400 cursor-wait'
                    : isActive
                      ? 'liquid-glass-text hover:bg-white/5'
                      : 'liquid-glass-text-muted hover:bg-white/5'
                }`}
              >
                {isLoading ? (
                  <Spinner />
                ) : (
                  <FontAwesomeIcon
                    icon={service.icon}
                    className={`text-[10px] w-3 ${isActive ? 'text-green-400' : 'opacity-50'}`}
                  />
                )}
                <span className={isActive ? '' : isLoading ? '' : 'opacity-60'}>{service.name}</span>
                {isActive && !isLoading && <span className="ml-auto text-green-400">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function LeftWing({
  connected,
  send,
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onTabNew,
  getEntitiesForTab
}) {
  const services = useStore(s => s.services)
  const servicesLoading = useStore(s => s.servicesLoading)
  const setServiceLoading = useStore(s => s.setServiceLoading)

  const handleServiceToggle = (service, isActive) => {
    console.log('handleServiceToggle called:', { service, isActive, hasSend: !!send })
    if (!send) {
      console.error('send function is not available!')
      return
    }

    if (!isActive) {
      // Starting a service - set loading state
      setServiceLoading(service, true)

      // Timeout after 15 seconds if service doesn't start
      setTimeout(() => {
        setServiceLoading(service, false)
      }, 15000)
    }

    const msg = {
      event: isActive ? 'service:stop' : 'service:start',
      service
    }
    console.log('Sending:', msg)
    send(msg)
  }

  return (
    <aside className="flex flex-col items-center w-10 pt-8 pb-2 liquid-glass-light gap-1 z-20 overflow-visible">
      {/* Tabs */}
      <div className="flex flex-col items-center gap-1 overflow-visible">
        {tabs?.map((tab, idx) => {
          const isActive = activeTabId === tab.id
          const realmIcon = REALM_ICONS[tab.name]

          return (
            <button
              key={tab.id}
              onClick={() => onTabSelect(tab.id)}
              className={`
                group relative w-8 h-8 flex items-center justify-center transition-all
                ${isActive
                  ? 'liquid-glass-pill liquid-glass-text'
                  : 'liquid-glass-text-muted hover:bg-white/5 rounded-lg'
                }
              `}
              title={`${tab.name} (Alt+${idx + 1})`}
            >
              {realmIcon && (
                <FontAwesomeIcon
                  icon={realmIcon}
                  className={`text-xs ${isActive ? 'text-accent' : 'opacity-50'}`}
                />
              )}
              {tabs.length > 1 && (
                <span
                  onClick={(e) => {
                    e.stopPropagation()
                    onTabClose(tab.id)
                  }}
                  className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-red-500/80 hover:bg-red-500 text-white rounded-lg transition-all cursor-pointer"
                >
                  <FontAwesomeIcon icon={faXmark} className="text-[10px]" />
                </span>
              )}
            </button>
          )
        })}

        {/* Add tab button */}
        <button
          onClick={onTabNew}
          className="w-8 h-8 flex items-center justify-center liquid-glass-text-muted hover:bg-white/10 rounded-lg transition-all"
          title="New tab (Alt+N)"
        >
          <FontAwesomeIcon icon={faPlus} className="text-xs" />
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Services dropdown */}
      <ServicesDropdown
        connected={connected}
        services={services}
        servicesLoading={servicesLoading}
        onToggle={handleServiceToggle}
      />
    </aside>
  )
}
