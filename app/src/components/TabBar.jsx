export default function TabBar({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onNew,
  onSummon,
  connected,
  godCount
}) {
  return (
    <nav className="flex items-center h-10 bg-bg-secondary border-b border-border">
      {/* Tabs */}
      <div className="flex items-center gap-1 px-2 overflow-x-auto">
        {tabs.map((tab, idx) => (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={`
              group flex items-center gap-2 h-7 px-3 rounded text-sm transition-all
              ${activeTabId === tab.id
                ? 'bg-bg-primary text-text-primary border border-border'
                : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
              }
            `}
          >
            <span className="text-xs text-text-secondary opacity-60">{idx + 1}</span>
            <span>{tab.name}</span>
            {tab.gods.length > 0 && (
              <span className="text-xs text-text-secondary">({tab.gods.length})</span>
            )}
            {tabs.length > 1 && (
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(tab.id)
                }}
                className="w-4 h-4 flex items-center justify-center text-text-secondary opacity-0 group-hover:opacity-100 hover:text-red-500 rounded transition-all cursor-pointer"
              >
                ×
              </span>
            )}
          </button>
        ))}

        {/* New tab button */}
        <button
          onClick={onNew}
          className="h-7 w-7 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded transition-all"
          title="New tab (Alt+N)"
        >
          +
        </button>
      </div>

      <div className="flex-1" />

      {/* Right side controls */}
      <div className="flex items-center gap-2 px-3">
        <button
          onClick={onSummon}
          disabled={!connected}
          className={`
            h-7 px-3 rounded text-sm font-medium transition-all
            ${connected
              ? 'bg-accent text-white hover:bg-[#5a62e0]'
              : 'bg-bg-tertiary text-text-secondary cursor-not-allowed'
            }
          `}
          title="Summon (Ctrl+N)"
        >
          + Summon
        </button>

        <span className="text-text-secondary text-sm">
          {godCount} god{godCount !== 1 ? 's' : ''}
        </span>

        <span
          className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
          title={connected ? 'Connected' : 'Disconnected'}
        />
      </div>
    </nav>
  )
}
