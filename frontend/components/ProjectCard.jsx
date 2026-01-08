import { motion } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPenToSquare, faTrash, faFolder, faStar, faCircle } from '@fortawesome/free-solid-svg-icons'

export default function ProjectCard({ project, onEdit, onDelete, onSetDefault, staggerIndex = 0 }) {
  const { name, path, description, isDefault } = project

  // Shorten path for display
  const shortPath = path?.replace(/^\/home\/[^/]+/, '~') || ''

  return (
    <motion.div
      className="group relative overflow-hidden"
      style={{ borderRadius: '12px' }}
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95, transition: { duration: 0.15 } }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 25,
        delay: staggerIndex * 0.05,
      }}
    >
      <div
        className={`liquid-glass p-3 cursor-pointer hover:bg-white/10 transition-colors ${
          isDefault ? 'ring-1 ring-yellow-500/50' : ''
        }`}
        style={{ borderRadius: '12px' }}
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
              isDefault
                ? 'text-yellow-400'
                : 'text-white/30 hover:text-yellow-400/70'
            }`}
            title={isDefault ? 'Default project' : 'Set as default'}
          >
            <FontAwesomeIcon
              icon={faStar}
              size="sm"
              className={isDefault ? '' : 'opacity-30'}
            />
          </button>

          <FontAwesomeIcon
            icon={faFolder}
            className="text-blue-400"
            size="sm"
          />
          <span className="text-sm font-medium text-white flex-1 truncate">
            {name}
          </span>

          {/* Action buttons */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onEdit?.(project)
              }}
              className="w-6 h-6 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 rounded transition-all"
              title="Edit project"
            >
              <FontAwesomeIcon icon={faPenToSquare} size="xs" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete?.(project)
              }}
              className="w-6 h-6 flex items-center justify-center text-white/60 hover:text-red-400 hover:bg-white/10 rounded transition-all"
              title="Delete project"
            >
              <FontAwesomeIcon icon={faTrash} size="xs" />
            </button>
          </div>
        </div>

        {/* Path */}
        <div className="text-xs text-white/40 font-mono truncate pl-7">
          {shortPath}
        </div>

        {/* Description */}
        {description && (
          <div className="text-xs text-white/50 mt-1 line-clamp-1 pl-7">
            {description}
          </div>
        )}
      </div>
    </motion.div>
  )
}
