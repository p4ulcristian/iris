import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store'
import { THEMES } from '../themes/generated/themes'
import HistoryPicker from './HistoryPicker'

function Spinner() {
  return (
    <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
  )
}

function ServiceIndicator({ name, serviceKey, active, loading, icon, onToggle }) {
  const isDisabled = loading

  return (
    <button
      onClick={() => !isDisabled && onToggle(serviceKey, active)}
      disabled={isDisabled}
      className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
        loading
          ? 'text-yellow-400 cursor-wait'
          : active
            ? 'text-green-400 hover:bg-green-400/10'
            : 'text-text-tertiary hover:bg-bg-tertiary'
      }`}
      title={
        loading
          ? `${name}: Starting...`
          : `${name}: ${active ? 'Online - Click to stop' : 'Offline - Click to start'}`
      }
    >
      {loading ? (
        <Spinner />
      ) : (
        <span className={active ? '' : 'opacity-50'}>{icon}</span>
      )}
      <span className={active ? '' : loading ? '' : 'line-through opacity-50'}>{name}</span>
    </button>
  )
}

const VIEW_MODES = [
  { id: 'grid', label: 'Grid', icon: '▦' },
  { id: 'focus', label: 'Focus', icon: '◰' }
]

function ModePicker({ send }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const viewMode = useStore(s => s.viewMode)
  const focusedGod = useStore(s => s.focusedGod)
  const getActiveGods = useStore(s => s.getActiveGods)
  const activeGods = getActiveGods()

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

  const currentMode = VIEW_MODES.find(m => m.id === viewMode) || VIEW_MODES[0]

  const handleSelect = (modeId) => {
    if (modeId === 'focus' && activeGods.length > 1) {
      // Enter focus mode with first god if none focused
      send({ event: 'viewMode:set', mode: 'focus', focusedGod: focusedGod || activeGods[0]?.name })
    } else {
      send({ event: 'viewMode:set', mode: modeId })
    }
    setOpen(false)
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs hover:bg-bg-tertiary transition-colors"
        title="Change layout mode"
      >
        <span>{currentMode.icon}</span>
        <span>{currentMode.label}</span>
        <span className="text-text-tertiary">▾</span>
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-1 min-w-[100px] bg-bg-secondary border border-border rounded shadow-lg py-1 z-50">
          {VIEW_MODES.map((m) => {
            const disabled = m.id === 'focus' && activeGods.length < 2
            return (
              <button
                key={m.id}
                onClick={() => !disabled && handleSelect(m.id)}
                disabled={disabled}
                className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 transition-colors ${
                  disabled
                    ? 'text-text-tertiary cursor-not-allowed'
                    : m.id === viewMode
                      ? 'bg-bg-tertiary text-text-primary'
                      : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
                }`}
              >
                <span>{m.icon}</span>
                <span>{m.label}</span>
                {m.id === viewMode && <span className="ml-auto">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DevToggle() {
  const devPanelOpen = useStore(s => s.devPanelOpen)
  const toggleDevPanel = useStore(s => s.toggleDevPanel)

  return (
    <button
      onClick={toggleDevPanel}
      className={`px-2 py-0.5 rounded text-xs transition-colors ${
        devPanelOpen
          ? 'text-accent bg-accent/10'
          : 'text-text-tertiary hover:bg-bg-tertiary hover:text-text-secondary'
      }`}
      title="Toggle Dev Panel (Ctrl+D)"
    >
      Dev
    </button>
  )
}

function ThemePicker({ send }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const theme = useStore(s => s.theme)

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

  const currentTheme = THEMES.find(t => t.id === theme) || THEMES[0]

  const handleSelect = (themeId) => {
    send({ event: 'theme:set', theme: themeId })
    setOpen(false)
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs hover:bg-bg-tertiary transition-colors"
        title="Change theme"
      >
        <span
          className="w-3 h-3 rounded-full border border-white/20"
          style={{ backgroundColor: currentTheme.accent }}
        />
        <span>{currentTheme.label}</span>
        <span className="text-text-tertiary">▾</span>
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-1 min-w-[140px] bg-bg-secondary border border-border rounded shadow-lg py-1 z-50">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => handleSelect(t.id)}
              className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 transition-colors ${
                t.id === theme
                  ? 'bg-bg-tertiary text-text-primary'
                  : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
              }`}
            >
              <span
                className="w-3 h-3 rounded-full border border-white/20"
                style={{ backgroundColor: t.accent }}
              />
              <span>{t.label}</span>
              {t.id === theme && <span className="ml-auto">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function StatusBar({ connected, send }) {
  const services = useStore(s => s.services)
  const servicesLoading = useStore(s => s.servicesLoading)
  const setServiceLoading = useStore(s => s.setServiceLoading)

  const handleServiceToggle = (service, isActive) => {
    if (!send) return

    if (!isActive) {
      // Starting a service - set loading state
      setServiceLoading(service, true)

      // Timeout after 15 seconds if service doesn't start
      setTimeout(() => {
        setServiceLoading(service, false)
      }, 15000)
    }

    send({
      event: isActive ? 'service:stop' : 'service:start',
      service
    })
  }

  return (
    <footer className="flex items-center h-8 px-4 bg-black/40 backdrop-blur-md border-t border-white/10 text-xs text-text-secondary">
      {/* Connection status */}
      <div className="flex items-center gap-1.5">
        <span className={connected ? 'text-green-500' : 'text-red-500'}>
          {connected ? '●' : '○'}
        </span>
        <span>{connected ? 'Connected' : 'Disconnected'}</span>
      </div>

      {/* Services */}
      <div className="flex items-center gap-1 ml-4 border-l border-border pl-4">
        <ServiceIndicator
          name="Wake"
          serviceKey="wake"
          active={services.wake}
          loading={servicesLoading.wake}
          icon="⌨️"
          onToggle={handleServiceToggle}
        />
        <ServiceIndicator
          name="Hear"
          serviceKey="hear"
          active={services.hear}
          loading={servicesLoading.hear}
          icon="👂"
          onToggle={handleServiceToggle}
        />
        <ServiceIndicator
          name="Speak"
          serviceKey="speak"
          active={services.speak}
          loading={servicesLoading.speak}
          icon="🔊"
          onToggle={handleServiceToggle}
        />
        <ServiceIndicator
          name="Express"
          serviceKey="express"
          active={services.express}
          loading={servicesLoading.express}
          icon="💬"
          onToggle={handleServiceToggle}
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* History picker */}
      <HistoryPicker send={send} />

      {/* Divider */}
      <div className="w-px h-4 bg-border mx-2" />

      {/* Mode picker */}
      <ModePicker send={send} />

      {/* Divider */}
      <div className="w-px h-4 bg-border mx-2" />

      {/* Theme picker */}
      <ThemePicker send={send} />

      {/* Divider */}
      <div className="w-px h-4 bg-border mx-2" />

      {/* Dev panel toggle */}
      <DevToggle />
    </footer>
  )
}
