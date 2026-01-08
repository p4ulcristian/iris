import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPenToSquare, faTrash, faLock } from '@fortawesome/free-solid-svg-icons'

export default function PersonalityCard({ personality, onEdit, onDelete }) {
  const { name, source, preview } = personality
  const isBundled = source === 'bundled'

  return (
    <div
      className="group liquid-glass p-3 rounded-lg cursor-pointer hover:bg-white/10 transition-colors"
      onClick={() => onEdit?.(personality)}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium text-text-primary flex-1 truncate">
          {name}
        </span>

        {/* Source badge */}
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-text-tertiary border border-white/10">
          {isBundled ? 'bundled' : 'user'}
        </span>

        {/* Action buttons */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onEdit?.(personality)
            }}
            className="w-6 h-6 flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-white/10 rounded transition-all"
            title="Edit"
          >
            <FontAwesomeIcon icon={faPenToSquare} size="xs" />
          </button>

          {!isBundled && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete?.(personality)
              }}
              className="w-6 h-6 flex items-center justify-center text-text-tertiary hover:text-red-400 hover:bg-white/10 rounded transition-all"
              title="Delete"
            >
              <FontAwesomeIcon icon={faTrash} size="xs" />
            </button>
          )}

          {isBundled && (
            <span className="w-6 h-6 flex items-center justify-center text-text-tertiary/50" title="Read-only">
              <FontAwesomeIcon icon={faLock} size="xs" />
            </span>
          )}
        </div>
      </div>

      {/* Preview */}
      {preview && (
        <div className="text-xs text-text-tertiary line-clamp-2 font-mono">
          {preview}
        </div>
      )}
    </div>
  )
}
