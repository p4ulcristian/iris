import { useStore } from '../store'

export default function DevPanel() {
  const state = useStore()
  const { devPanelOpen, toggleDevPanel } = state

  // Extract only the data (not functions) for display
  const stateData = {
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    entities: state.entities,
    focusedEntity: state.focusedEntity,
    layoutMode: state.layoutMode,
    connected: state.connected,
  }

  if (!devPanelOpen) {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-h-[60vh] bg-bg-secondary border border-border rounded-lg shadow-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-bg-tertiary border-b border-border">
        <span className="text-sm font-medium text-text-primary">State</span>
        <button
          onClick={toggleDevPanel}
          className="w-6 h-6 flex items-center justify-center text-text-secondary hover:text-text-primary rounded transition-all"
        >
          ×
        </button>
      </div>

      {/* State display */}
      <div className="flex-1 overflow-auto p-3">
        <pre className="text-xs text-text-secondary font-mono whitespace-pre-wrap break-all">
          {JSON.stringify(stateData, null, 2)}
        </pre>
      </div>

      {/* Quick info footer */}
      <div className="px-3 py-2 bg-bg-tertiary border-t border-border text-xs text-text-secondary">
        <span className="text-accent">{Object.keys(state.gods).length}</span> gods |{' '}
        <span className="text-accent">{state.tabs.length}</span> tabs |{' '}
        Tab <span className="text-accent">{state.activeTabId}</span> active
      </div>
    </div>
  )
}
