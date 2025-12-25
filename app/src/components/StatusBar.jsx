export default function StatusBar({ voiceState, godCount, connected }) {
  return (
    <footer className="flex items-center h-8 px-4 bg-bg-secondary border-t border-border text-xs text-text-secondary">
      <div className="flex items-center gap-1.5">
        <span className={`${voiceState === 'listening' ? 'animate-pulse-glow text-green-500' : voiceState === 'processing' ? 'animate-spin text-accent' : ''}`}>
          {connected ? '🎤' : '⚠️'}
        </span>
        <span>
          {!connected ? 'Disconnected' : voiceState === 'listening' ? 'Listening...' : voiceState === 'processing' ? 'Processing...' : 'Ready'}
        </span>
      </div>

      <div className="ml-auto mr-4">
        {godCount} god{godCount !== 1 ? 's' : ''}
      </div>

      <div className="flex gap-2">
        <button className="w-6 h-6 flex items-center justify-center hover:bg-bg-tertiary rounded transition-colors">
          ⚙
        </button>
      </div>
    </footer>
  )
}
