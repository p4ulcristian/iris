import { motion } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPenToSquare, faTrash, faDna, faLock } from '@fortawesome/free-solid-svg-icons'

export default function PersonalityCard({ personality, onEdit, onDelete, staggerIndex = 0 }) {
  const { name, source, preview } = personality
  const isBundled = source === 'bundled'

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
        className="liquid-glass p-3 cursor-pointer hover:bg-white/10 transition-colors"
        style={{ borderRadius: '12px' }}
        onClick={() => onEdit?.(personality)}
      >
        {/* Header row */}
        <div className="flex items-center gap-2 mb-2">
          <FontAwesomeIcon
            icon={faDna}
            className="text-purple-400"
            size="sm"
          />
          <span className="text-sm font-medium text-white flex-1 truncate">
            {name}
          </span>

          {/* Source badge */}
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            isBundled
              ? 'bg-blue-500/20 text-blue-300'
              : 'bg-green-500/20 text-green-300'
          }`}>
            {isBundled ? 'bundled' : 'user'}
          </span>

          {/* Action buttons */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onEdit?.(personality)
              }}
              className="w-6 h-6 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 rounded transition-all"
              title="Edit personality"
            >
              <FontAwesomeIcon icon={faPenToSquare} size="xs" />
            </button>

            {!isBundled && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete?.(personality)
                }}
                className="w-6 h-6 flex items-center justify-center text-white/60 hover:text-red-400 hover:bg-white/10 rounded transition-all"
                title="Delete personality"
              >
                <FontAwesomeIcon icon={faTrash} size="xs" />
              </button>
            )}

            {isBundled && (
              <span
                className="w-6 h-6 flex items-center justify-center text-white/30"
                title="Bundled personalities are read-only"
              >
                <FontAwesomeIcon icon={faLock} size="xs" />
              </span>
            )}
          </div>
        </div>

        {/* Preview */}
        {preview && (
          <div className="text-xs text-white/50 line-clamp-2 font-mono leading-relaxed">
            {preview}
          </div>
        )}
      </div>
    </motion.div>
  )
}
