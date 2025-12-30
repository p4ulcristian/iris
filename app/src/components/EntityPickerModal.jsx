import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'
import { EntityIcon, ENTITY_TYPE_LIST } from '../entities'

// Filter entity types for the picker (exclude code, calendar, oracle which are spawned via other means)
const PICKER_ENTITY_TYPES = ENTITY_TYPE_LIST.filter(e =>
  ['god', 'terminal', 'nvim', 'browser', 'git', 'linear', 'history', 'cemetery', 'settings', 'youtube-music', 'messenger', 'discord'].includes(e.type)
)

export default function EntityPickerModal({
  isOpen,
  initialMode = 'pick',
  usedGodNames = [],
  onSpawnGod,
  onSpawnEntity,
  onCancel
}) {
  const [mode, setMode] = useState(initialMode) // 'pick' | 'god'
  const [selectedGod, setSelectedGod] = useState('')
  const [task, setTask] = useState('')
  const inputRef = useRef(null)
  const godColors = useStore(s => s.godColors)

  // Get available gods from server-provided godColors
  const allGods = Object.keys(godColors)
  const usedLower = usedGodNames.map(n => n.toLowerCase())
  const availableGods = allGods.filter(g => !usedLower.includes(g))
  const godPool = availableGods.length > 0 ? availableGods : allGods

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode)
      const randomGod = godPool[Math.floor(Math.random() * godPool.length)]
      setSelectedGod(randomGod)
      setTask('')
    }
  }, [isOpen, initialMode])

  // Focus task input when entering god mode
  useEffect(() => {
    if (mode === 'god') {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [mode])

  // Handle keyboard
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (mode === 'god') {
          setMode('pick')
        } else {
          onCancel()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, mode, onCancel])

  const handleEntityClick = (entityType) => {
    if (entityType === 'god') {
      setMode('god')
    } else if (entityType === 'terminal') {
      onSpawnEntity('terminal')
      onCancel()
    } else {
      onSpawnEntity(entityType)
      onCancel()
    }
  }

  const handleSummonGod = (e) => {
    e?.preventDefault()
    const name = selectedGod.charAt(0).toUpperCase() + selectedGod.slice(1)
    onSpawnGod(name, task.trim())
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative bg-black/80 backdrop-blur-xl border border-white/20 rounded-2xl shadow-xl w-[420px] p-5 max-h-[80vh] overflow-y-auto">
        {mode === 'pick' ? (
          <>
            <h3 className="text-white font-medium mb-4 text-lg">Add to workspace</h3>

            {/* Entity type grid */}
            <div className="grid grid-cols-2 gap-3">
              {PICKER_ENTITY_TYPES.map(entity => (
                <button
                  key={entity.type}
                  onClick={() => handleEntityClick(entity.type)}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all text-left group cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-white/70 group-hover:text-white group-hover:bg-white/15 transition-all">
                    <EntityIcon type={entity.type} />
                  </div>
                  <div>
                    <div className="text-white font-medium text-sm">{entity.label}</div>
                    <div className="text-white/50 text-xs">{entity.description}</div>
                  </div>
                </button>
              ))}
            </div>

            {/* Cancel button */}
            <div className="flex justify-end mt-4">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          /* God summoning form */
          <form onSubmit={handleSummonGod}>
            <div className="flex items-center gap-2 mb-4">
              <button
                type="button"
                onClick={() => setMode('pick')}
                className="text-white/60 hover:text-white p-1 -ml-1 cursor-pointer"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" />
                </svg>
              </button>
              <h3 className="text-white font-medium text-lg">Summon a God</h3>
            </div>

            {/* God selector */}
            <div className="mb-4">
              <label className="block text-white/60 text-sm mb-1.5">God</label>
              <div className="relative">
                <select
                  value={selectedGod}
                  onChange={(e) => setSelectedGod(e.target.value)}
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2.5 text-white appearance-none cursor-pointer focus:outline-none focus:border-white/40 transition-all"
                  style={{
                    borderLeftWidth: '3px',
                    borderLeftColor: godColors[selectedGod] || '#888'
                  }}
                >
                  {godPool.map(god => (
                    <option key={god} value={god} className="bg-gray-900">
                      {god.charAt(0).toUpperCase() + god.slice(1)}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/40">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Task input */}
            <div className="mb-4">
              <label className="block text-white/60 text-sm mb-1.5">
                Task <span className="opacity-50">(optional)</span>
              </label>
              <textarea
                ref={inputRef}
                value={task}
                onChange={(e) => setTask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (e.ctrlKey || e.metaKey) {
                      return
                    }
                    e.preventDefault()
                    handleSummonGod()
                  }
                }}
                placeholder="What should they do?"
                rows={3}
                className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2.5 text-white placeholder-white/30 resize-none focus:outline-none focus:border-white/40 transition-all"
              />
              <p className="text-white/30 text-xs mt-1">
                Enter to summon · Ctrl+Enter for newline
              </p>
            </div>

            {/* Buttons */}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMode('pick')}
                className="px-4 py-2 text-sm text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-all cursor-pointer"
              >
                Back
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer"
                style={{
                  backgroundColor: (godColors[selectedGod] || '#888') + '33',
                  color: godColors[selectedGod] || '#888',
                  borderWidth: '1px',
                  borderColor: (godColors[selectedGod] || '#888') + '66'
                }}
              >
                Summon
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
