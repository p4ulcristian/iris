import { useStore } from '../store'

function ServiceIndicator({ name, serviceKey, active, icon, onToggle }) {
  return (
    <button
      onClick={() => onToggle(serviceKey, active)}
      className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
        active
          ? 'text-green-400 hover:bg-green-400/10'
          : 'text-text-tertiary hover:bg-bg-tertiary'
      }`}
      title={`${name}: ${active ? 'Online - Click to stop' : 'Offline - Click to start'}`}
    >
      <span className={active ? '' : 'opacity-50'}>{icon}</span>
      <span className={active ? '' : 'line-through opacity-50'}>{name}</span>
    </button>
  )
}

export default function StatusBar({ godCount, connected, send }) {
  const services = useStore(s => s.services)

  const handleServiceToggle = (service, isActive) => {
    if (!send) return
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
        <ServiceIndicator name="Hear" serviceKey="hear" active={services.hear} icon="👂" onToggle={handleServiceToggle} />
        <ServiceIndicator name="Speak" serviceKey="speak" active={services.speak} icon="🔊" onToggle={handleServiceToggle} />
        <ServiceIndicator name="Express" serviceKey="express" active={services.express} icon="💬" onToggle={handleServiceToggle} />
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
