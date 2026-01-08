import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPenToSquare, faTrash, faStar } from '@fortawesome/free-solid-svg-icons'

export default function ProjectCard({ project, onEdit, onDelete, onSetDefault }) {
  const { name, path, description, isDefault } = project

  // Shorten path for display
  const shortPath = path?.replace(/^\/home\/[^/]+/, '~') || ''

  return (
    <div
      className={`group liquid-glass p-3 rounded-lg cursor-pointer hover:bg-white/10 transition-colors ${
        isDefault ? 'ring-1 ring-accent/30' : ''
      }`}
      onClick={() => onEdit?.(project)}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 mb-1">
        {/* Default toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onSetDefault?.(project)
          }}
          className={`w-5 h-5 flex items-center justify-center transition-colors ${
            isDefault ? 'text-accent' : 'text-text-tertiary/30 hover:text-accent/50'
          }`}
          title={isDefault ? 'Default project' : 'Set as default'}
        >
          <FontAwesomeIcon icon={faStar} size="xs" />
        </button>

        <span className="text-sm font-medium text-text-primary flex-1 truncate">
          {name}
        </span>

        {/* Action buttons */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onEdit?.(project)
            }}
            className="w-6 h-6 flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-white/10 rounded transition-all"
            title="Edit"
          >
            <FontAwesomeIcon icon={faPenToSquare} size="xs" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete?.(project)
            }}
            className="w-6 h-6 flex items-center justify-center text-text-tertiary hover:text-red-400 hover:bg-white/10 rounded transition-all"
            title="Delete"
          >
            <FontAwesomeIcon icon={faTrash} size="xs" />
          </button>
        </div>
      </div>

      {/* Path */}
      <div className="text-xs text-text-tertiary font-mono truncate pl-7">
        {shortPath}
      </div>

      {/* Description */}
      {description && (
        <div className="text-xs text-text-secondary mt-1 line-clamp-1 pl-7">
          {description}
        </div>
      )}
    </div>
  )
}
