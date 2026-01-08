import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBolt, faScroll, faCodeBranch, faGlobe, faListCheck, faGear } from '@fortawesome/free-solid-svg-icons'

const views = [
  { id: 'work', icon: faBolt, label: 'Work', shortcut: 'Alt+W' },
  { id: 'history', icon: faScroll, label: 'History', shortcut: 'Alt+H' },
  { id: 'git', icon: faCodeBranch, label: 'Git', shortcut: 'Alt+G' },
  { id: 'linear', icon: faListCheck, label: 'Linear', shortcut: 'Alt+L' },
  { id: 'browser', icon: faGlobe, label: 'Browser', shortcut: 'Alt+B' },
  { id: 'settings', icon: faGear, label: 'Settings', shortcut: 'Alt+S' },
]

export default function ViewNav({ currentView, onViewChange, disabled }) {
  return (
    <div className="flex items-center gap-1">
      {views.map(view => (
        <button
          key={view.id}
          onClick={() => onViewChange(view.id)}
          disabled={disabled}
          className={`
            w-8 h-8 flex items-center justify-center rounded transition-all
            ${currentView === view.id
              ? 'bg-accent/20 text-accent'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
          title={`${view.label} (${view.shortcut})`}
        >
          <FontAwesomeIcon icon={view.icon} className="text-sm" />
        </button>
      ))}
    </div>
  )
}
