import { useStore } from '../store'

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

export default function StatusBar({ godCount, connected, send }) {
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
    <footer className="flex items-center h-8 px-4 bg-bg-secondary border-t border-border text-xs text-text-secondary">
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

      {/* God count */}
      <div className="ml-auto mr-4">
        {godCount} god{godCount !== 1 ? 's' : ''}
      </div>

      {/* Settings */}
      <div className="flex gap-2">
        <button className="w-6 h-6 flex items-center justify-center hover:bg-bg-tertiary rounded transition-colors">
          ⚙
        </button>
      </div>
    </footer>
  )
}
