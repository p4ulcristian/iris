import { motion } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPenToSquare, faTrash, faPlug, faLock } from '@fortawesome/free-solid-svg-icons'

export default function McpServerCard({ server, onEdit, onDelete, staggerIndex = 0 }) {
  const { name, description, source } = server
  const isBundled = source === 'bundled'

  return (
    <motion.div
      className="group relative overflow-hidden"
      style={{ borderRadius: '10px' }}
      initial={{ opacity: 0, y: -15, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 15, scale: 0.95, transition: { duration: 0.15 } }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 25,
        delay: staggerIndex * 0.03,
      }}
    >
      <div
        className="liquid-glass p-2.5 cursor-pointer hover:bg-white/10 transition-colors"
        style={{ borderRadius: '10px' }}
        onClick={() => onEdit?.(server)}
      >
        {/* Header row */}
        <div className="flex items-center gap-2">
          <FontAwesomeIcon
            icon={faPlug}
            className="text-cyan-400"
            size="xs"
          />
          <span className="text-xs font-medium text-white flex-1 truncate">
            {name}
          </span>

          {/* Source badge */}
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
            isBundled
              ? 'bg-blue-500/20 text-blue-300'
              : 'bg-green-500/20 text-green-300'
          }`}>
            {isBundled ? 'bundled' : 'user'}
          </span>

          {/* Action buttons */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onEdit?.(server)
              }}
              className="w-5 h-5 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 rounded transition-all"
              title="Edit MCP server"
            >
              <FontAwesomeIcon icon={faPenToSquare} size="xs" />
            </button>

            {!isBundled && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete?.(server)
                }}
                className="w-5 h-5 flex items-center justify-center text-white/60 hover:text-red-400 hover:bg-white/10 rounded transition-all"
                title="Delete MCP server"
              >
                <FontAwesomeIcon icon={faTrash} size="xs" />
              </button>
            )}

            {isBundled && (
              <span
                className="w-5 h-5 flex items-center justify-center text-white/30"
                title="Bundled MCP servers are read-only"
              >
                <FontAwesomeIcon icon={faLock} size="xs" />
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        {description && (
          <div className="text-[10px] text-white/40 line-clamp-1 mt-1 leading-relaxed">
            {description}
          </div>
        )}
      </div>
    </motion.div>
  )
}
