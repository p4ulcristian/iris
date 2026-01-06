import { motion, AnimatePresence } from 'framer-motion'

// Detect if we're on macOS
const isMacOS = /Mac|iPhone|iPad|iPod/.test(navigator.platform)
const modifierKey = isMacOS ? 'Cmd' : 'Alt'

const createShortcuts = (mod) => [
  {
    title: 'Entities',
    items: [
      { keys: [mod, 'N'], action: 'Summon god' },
      { keys: [mod, 'R'], action: 'Raw terminal' },
      { keys: [mod, 'K'], action: 'Kill focused' },
      { keys: [mod, '↑'], action: 'Focus prev' },
      { keys: [mod, '↓'], action: 'Focus next' },
    ]
  },
  {
    title: 'Tabs',
    items: [
      { keys: [mod, 'T'], action: 'New tab' },
      { keys: [mod, 'W'], action: 'Close tab' },
      { keys: [mod, '←'], action: 'Prev tab' },
      { keys: [mod, '→'], action: 'Next tab' },
      { keys: [mod, '1-9'], action: 'Go to tab' },
    ]
  },
  {
    title: 'Window',
    items: [
      { keys: [mod, 'F'], action: 'Fullscreen' },
      { keys: [mod, 'B'], action: 'Toggle sidebar' },
      { keys: [mod, 'D'], action: 'Dev panel' },
      { keys: ['Esc'], action: 'Clear focus' },
    ]
  },
]

const shortcuts = createShortcuts(modifierKey)

function Shortcut({ keys, action }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-text-secondary text-sm">{action}</span>
      <div className="flex gap-1">
        {keys.map((key, i) => (
          <kbd
            key={i}
            className="px-2 py-0.5 bg-bg-tertiary border border-border rounded font-mono text-xs text-text-primary min-w-[24px] text-center"
          >
            {key}
          </kbd>
        ))}
      </div>
    </div>
  )
}

function Section({ title, items }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{title}</h3>
      <div className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <Shortcut key={i} keys={item.keys} action={item.action} />
        ))}
      </div>
    </div>
  )
}

export default function ShortcutsPopup({ isOpen }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
        >
          {/* Subtle backdrop */}
          <div className="absolute inset-0 bg-black/20" />

          {/* Popup */}
          <motion.div
            className="relative liquid-glass-modal p-6 max-w-xl"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.1 }}
          >
            <h2 className="text-lg font-semibold text-text-primary mb-4 text-center">
              Keyboard Shortcuts
            </h2>

            <div className="grid grid-cols-3 gap-6">
              {shortcuts.map((section, i) => (
                <Section key={i} title={section.title} items={section.items} />
              ))}
            </div>

            <p className="text-xs text-text-secondary text-center mt-4 opacity-60">
              Release {modifierKey} to close
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
