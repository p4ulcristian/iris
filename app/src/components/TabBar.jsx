import { useState, useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faExpand, faCompress } from '@fortawesome/free-solid-svg-icons'

export default function TabBar({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onNew,
  onOpenSummon,
  connected,
  getEntitiesForTab
}) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Check fullscreen state on mount and when it changes
  useEffect(() => {
    const checkFullscreen = async () => {
      if (window.iris?.isFullscreen) {
        const fs = await window.iris.isFullscreen()
        setIsFullscreen(fs)
      }
    }
    checkFullscreen()

    // Listen for fullscreen changes
    const handleFullscreenChange = () => checkFullscreen()
    document.addEventListener('fullscreenchange', handleFullscreenChange)

    // Check periodically since Electron fullscreen doesn't trigger DOM event
    const interval = setInterval(checkFullscreen, 500)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      clearInterval(interval)
    }
  }, [])

  const toggleFullscreen = () => {
    if (window.iris?.windowControl) {
      window.iris.windowControl('toggle-fullscreen')
      // Optimistically update state
      setIsFullscreen(!isFullscreen)
    }
  }

  return (
    <nav className="flex items-center h-10 liquid-glass-light">
      {/* Tabs */}
      <div className="flex items-center gap-1 px-2 overflow-x-auto">
        {tabs.map((tab, idx) => {
          const entityCount = getEntitiesForTab ? getEntitiesForTab(tab.id).length : 0
          return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={`
              group flex items-center gap-2 h-7 px-3 rounded text-sm transition-all
              ${activeTabId === tab.id
                ? 'bg-white/10 text-text-primary border border-white/20'
                : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
              }
            `}
          >
            <span>{tab.name}</span>
            <span className="text-xs text-text-secondary opacity-50">Alt+{idx + 1}</span>
            {entityCount > 0 && (
              <span className="text-xs text-text-secondary">({entityCount})</span>
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
          )
        })}

        {/* Add tab button */}
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
      <div className="flex items-center gap-3 px-3">
        <button
          onClick={toggleFullscreen}
          className="w-7 h-7 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded transition-all"
          title={isFullscreen ? 'Exit fullscreen (F11)' : 'Fullscreen (F11)'}
        >
          <FontAwesomeIcon icon={isFullscreen ? faCompress : faExpand} size="sm" />
        </button>

        <span
          className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
          title={connected ? 'Connected' : 'Disconnected'}
        />
      </div>
    </nav>
  )
}
