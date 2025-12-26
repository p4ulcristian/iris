import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'

export default function SummonModal({
  isOpen,
  usedGodNames = [],
  onSummon,
  onCancel
}) {
  const [selectedGod, setSelectedGod] = useState('')
  const [task, setTask] = useState('')
  const inputRef = useRef(null)
  const godColors = useStore(s => s.godColors)

  // Get available gods from server-provided godColors
  const allGods = Object.keys(godColors)
  const usedLower = usedGodNames.map(n => n.toLowerCase())
  const availableGods = allGods.filter(g => !usedLower.includes(g))
  const godPool = availableGods.length > 0 ? availableGods : allGods

  // Pick random god on open
  useEffect(() => {
    if (isOpen) {
      const randomGod = godPool[Math.floor(Math.random() * godPool.length)]
      setSelectedGod(randomGod)
      setTask('')
      // Focus input after a brief delay for modal animation
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Handle keyboard
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel])

  const handleSubmit = (e) => {
    e?.preventDefault()
    const name = selectedGod.charAt(0).toUpperCase() + selectedGod.slice(1)
    onSummon(name, task.trim())
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onCancel}
      />

      {/* Modal */}
      <form
        onSubmit={handleSubmit}
        className="relative bg-bg-secondary border border-border rounded-lg shadow-xl w-96 p-4"
      >
        <h3 className="text-text-primary font-medium mb-4">Summon a God</h3>

        {/* God selector */}
        <div className="mb-4">
          <label className="block text-text-secondary text-sm mb-1.5">God</label>
          <div className="relative">
            <select
              value={selectedGod}
              onChange={(e) => setSelectedGod(e.target.value)}
              className="w-full bg-bg-tertiary border border-border rounded px-3 py-2 text-text-primary appearance-none cursor-pointer focus:outline-none focus:border-accent"
              style={{
                borderLeftWidth: '3px',
                borderLeftColor: godColors[selectedGod] || '#888'
              }}
            >
              {godPool.map(god => (
                <option key={god} value={god}>
                  {god.charAt(0).toUpperCase() + god.slice(1)}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-secondary">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
            </div>
          </div>
        </div>

        {/* Task input */}
        <div className="mb-4">
          <label className="block text-text-secondary text-sm mb-1.5">
            Task <span className="opacity-50">(optional)</span>
          </label>
          <textarea
            ref={inputRef}
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.ctrlKey || e.metaKey) {
                  // Ctrl+Enter: insert newline (let default happen)
                  return
                }
                // Plain Enter: summon
                e.preventDefault()
                handleSubmit()
              }
            }}
            placeholder="What should they do?"
            rows={3}
            className="w-full bg-bg-tertiary border border-border rounded px-3 py-2 text-text-primary placeholder-text-secondary/50 resize-none focus:outline-none focus:border-accent"
          />
          <p className="text-text-secondary/50 text-xs mt-1">
            Enter to summon · Ctrl+Enter for newline
          </p>
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-1.5 text-sm font-medium rounded transition-all"
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
    </div>
  )
}
