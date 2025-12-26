import { motion, AnimatePresence } from 'motion/react'

const STATUS_ICONS = {
  working: '▶',
  done: '✦',
  stuck: '⚠',
  scattered: '⚡'
}

export default function GodTabs({ gods, activeGod, onSelect, onClose, onSummon, connected }) {
  return (
    <nav className="flex items-center gap-1 h-11 px-3 bg-bg-secondary border-b border-border overflow-x-auto">
      <AnimatePresence mode="popLayout">
        {gods.map(god => (
          <motion.button
            key={god.name}
            initial={{ opacity: 0, x: 20, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            onClick={() => onSelect(god.name)}
            className={`
              flex items-center gap-2 h-8 px-3
              bg-bg-tertiary border border-border rounded-md
              text-sm cursor-pointer transition-all duration-200
              hover:bg-[#222] hover:border-[#333]
              ${activeGod === god.name ? 'bg-bg-primary text-text-primary' : 'text-text-secondary'}
            `}
            style={{
              borderColor: activeGod === god.name ? god.color : undefined,
              boxShadow: activeGod === god.name ? `0 0 12px ${god.color}33` : undefined
            }}
          >
            <span className="text-[10px]" style={{ color: god.color }}>●</span>
            <span>{god.name}</span>
            <span className={`text-[10px] opacity-70 ${god.status === 'done' ? 'text-green-500' : god.status === 'stuck' ? 'text-red-500' : god.status === 'scattered' ? 'text-red-500' : ''}`}>
              {STATUS_ICONS[god.status] || '▶'}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onClose(god.name)
              }}
              className="w-4 h-4 flex items-center justify-center text-text-secondary text-sm opacity-0 hover:opacity-100 hover:bg-white/10 hover:text-red-500 rounded transition-all group-hover:opacity-100"
              title="Banish"
            >
              ×
            </button>
          </motion.button>
        ))}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.02, y: -1 }}
        whileTap={{ scale: 0.98 }}
        onClick={onSummon}
        disabled={!connected}
        className={`
          h-8 px-4 rounded-md text-sm font-medium transition-all
          ${connected
            ? 'bg-accent text-white hover:bg-[#5a62e0]'
            : 'bg-bg-tertiary text-text-secondary cursor-not-allowed'
          }
        `}
      >
        + Summon
      </motion.button>
    </nav>
  )
}
