import { faPenToSquare, faTrash, faStar } from '@fortawesome/free-solid-svg-icons'
import { Card, IconButton } from '../../_ui'

export default function ProjectCard({ project, onEdit, onDelete, onSetDefault }) {
  const { name, path, isDefault } = project
  const shortPath = path?.replace(/^\/home\/[^/]+/, '~') || ''

  return (
    <Card
      hover
      compact
      onClick={() => onEdit?.(project)}
      className={isDefault ? 'ring-1 ring-accent/30' : ''}
    >
      <div className="flex items-center gap-3">
        <IconButton
          icon={faStar}
          onClick={(e) => { e.stopPropagation(); onSetDefault?.(project) }}
          title={isDefault ? 'Default project' : 'Set as default'}
          className={isDefault ? 'text-accent' : 'text-text-tertiary/30 hover:text-accent/50'}
        />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-text-primary truncate block">{name}</span>
          <p className="text-xs text-text-tertiary truncate mt-0.5 font-mono">{shortPath}</p>
        </div>
        <div className="flex items-center shrink-0">
          <IconButton
            icon={faPenToSquare}
            onClick={(e) => { e.stopPropagation(); onEdit?.(project) }}
            title="Edit"
            className="text-text-tertiary hover:text-text-primary"
          />
          <IconButton
            icon={faTrash}
            onClick={(e) => { e.stopPropagation(); onDelete?.(project) }}
            title="Delete"
            className="text-text-tertiary hover:text-red-400"
          />
        </div>
      </div>
    </Card>
  )
}
