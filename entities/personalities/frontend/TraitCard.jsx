import { faPenToSquare, faTrash, faLock } from '@fortawesome/free-solid-svg-icons'
import { Card, IconButton } from '../../_ui'

export default function TraitCard({ trait, onEdit, onDelete }) {
  const { name, source, preview } = trait
  const isBundled = source === 'bundled'

  return (
    <Card hover compact onClick={() => onEdit?.(trait)}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary truncate">{name}</span>
            {isBundled && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-text-tertiary border border-white/10 shrink-0">
                bundled
              </span>
            )}
          </div>
          {preview && (
            <p className="text-xs text-text-tertiary truncate mt-0.5 font-mono">{preview}</p>
          )}
        </div>
        <div className="flex items-center shrink-0">
          <IconButton
            icon={faPenToSquare}
            onClick={(e) => { e.stopPropagation(); onEdit?.(trait) }}
            title="Edit"
            className="text-text-tertiary hover:text-text-primary"
          />
          {isBundled ? (
            <IconButton icon={faLock} disabled title="Bundled" className="text-text-tertiary/50" />
          ) : (
            <IconButton
              icon={faTrash}
              onClick={(e) => { e.stopPropagation(); onDelete?.(trait) }}
              title="Delete"
              className="text-text-tertiary hover:text-red-400"
            />
          )}
        </div>
      </div>
    </Card>
  )
}
