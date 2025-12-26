import { useStore } from '../store'

function ServiceIndicator({ name, active, icon }) {
  return (
    <div
      className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
        active ? 'text-green-400' : 'text-text-tertiary'
      }`}
      title={`${name}: ${active ? 'Online' : 'Offline'}`}
    >
      <span className={active ? '' : 'opacity-50'}>{icon}</span>
      <span className={active ? '' : 'line-through opacity-50'}>{name}</span>
    </div>
  )
}

export default function StatusBar({ godCount, connected }) {
  const services = useStore(s => s.services)

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
        <ServiceIndicator name="Hear" active={services.hear} icon="👂" />
        <ServiceIndicator name="Speak" active={services.speak} icon="🔊" />
        <ServiceIndicator name="Express" active={services.express} icon="💬" />
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
