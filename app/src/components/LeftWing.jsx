import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCircle,
  faKeyboard,
  faEarListen,
  faVolumeHigh,
  faCommentDots,
  faXmark,
  faPlus,
  faBrain
} from '@fortawesome/free-solid-svg-icons'
import IconButton from './ui/IconButton'
import { REALM_COLORS } from '../themes'

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
        className="btn btn-glass btn-icon btn-icon-md"
        title={`Services (${activeCount}/${serviceList.length})`}
      >
        <FontAwesomeIcon
          icon={faCircle}
          className={`text-[8px] ${connected ? 'text-green-500' : 'text-red-500'}`}
        />
      </button>

      {open && (
        <div className="absolute left-full bottom-0 ml-2 min-w-[160px] liquid-glass py-1.5 z-50">
          {serviceList.map((service) => {
            const isActive = services[service.key]
            const isLoading = servicesLoading[service.key]

            return (
              <button
                key={service.key}
                onClick={() => !isLoading && onToggle(service.key, isActive)}
                disabled={isLoading}
                className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2.5 transition-all rounded-lg mx-auto ${
                  isLoading
                    ? 'text-yellow-400 cursor-wait'
                    : isActive
                      ? 'liquid-glass-text hover:bg-white/10'
                      : 'liquid-glass-text-muted hover:bg-white/10'
                }`}
                style={{ width: 'calc(100% - 8px)', marginLeft: '4px' }}
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
                {isActive && !isLoading && <span className="ml-auto text-green-400 text-[10px]">●</span>}
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
    <aside className="flex flex-col items-center w-fit liquid-glass-light gap-1 z-20 overflow-visible pl-3 pr-3">
      {/* Tabs */}
      <div className="flex flex-col items-center gap-1 overflow-visible">
        {tabs?.map((tab, idx) => {
          const isActive = activeTabId === tab.id
          const realmColor = REALM_COLORS[tab.name] || '#888888'

          return (
            <button
              key={tab.id}
              onClick={() => onTabSelect(tab.id)}
              className={`
                group relative btn btn-icon btn-icon-md
                ${isActive
                  ? 'btn-glass'
                  : 'btn-ghost'
                }
              `}
              title={`${tab.name} (Alt+${idx + 1})`}
            >
              <FontAwesomeIcon
                icon={faCircle}
                style={{ color: realmColor }}
                className={`text-[10px] ${isActive ? '' : 'opacity-50'}`}
              />
              {tabs.length > 1 && (
                <span
                  onClick={(e) => {
                    e.stopPropagation()
                    onTabClose(tab.id)
                  }}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center scale-0 group-hover:scale-100 bg-white/10 backdrop-blur-md hover:bg-red-500/60 text-white/60 hover:text-white rounded-full transition-all duration-200 cursor-pointer text-[8px] border border-white/10 hover:border-red-400/30"
                >
                  <FontAwesomeIcon icon={faXmark} />
                </span>
              )}
            </button>
          )
        })}

        {/* Add tab button */}
        <IconButton
          icon={faPlus}
          size="md"
          variant="ghost"
          onClick={onTabNew}
          title="New tab (Alt+N)"
        />
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
