import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircle, faSpinner, faCircleCheck, faListCheck, faChevronRight, faChevronDown } from '@fortawesome/free-solid-svg-icons'

export default function TodoCard({ todos }) {
  const [expanded, setExpanded] = useState(false)

  if (!todos?.length) return null

  const completed = todos.filter(t => t.status === 'completed').length
  const total = todos.length
  const inProgress = todos.find(t => t.status === 'in_progress')

  // Status text for header
  const statusText = inProgress
    ? (inProgress.activeForm || inProgress.content)
    : completed === total
      ? 'All done!'
      : `${total - completed} pending`

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-white/5 transition-colors"
      >
        <FontAwesomeIcon icon={faListCheck} className="text-purple-400 text-sm" />
        <span className="text-white/70 text-sm font-medium">Tasks</span>
        <span className="text-white/40 text-sm">-</span>
        <span className="text-white/60 text-sm truncate flex-1 text-left">{statusText}</span>
        <FontAwesomeIcon
          icon={expanded ? faChevronDown : faChevronRight}
          className="text-white/30 text-xs"
        />
        <span className="text-white/40 text-xs">{completed}/{total}</span>
      </button>

      {expanded && (
        <div className="border-t border-white/10">
          {todos.map((todo, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm ${
                todo.status === 'completed'
                  ? 'bg-green-500/10'
                  : todo.status === 'in_progress'
                    ? 'bg-yellow-500/10'
                    : ''
              }`}
            >
              <span className="text-white/30 text-xs w-4">{i + 1}.</span>
              <span className={`flex-1 ${todo.status === 'completed' ? 'text-white/40' : 'text-white/80'}`}>
                {todo.status === 'in_progress' ? todo.activeForm || todo.content : todo.content}
              </span>
              {todo.status === 'completed' ? (
                <FontAwesomeIcon icon={faCircleCheck} className="text-green-500 text-xs" />
              ) : todo.status === 'in_progress' ? (
                <FontAwesomeIcon icon={faSpinner} className="text-yellow-400 text-xs animate-spin" />
              ) : (
                <FontAwesomeIcon icon={faCircle} className="text-white/30 text-xs" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
