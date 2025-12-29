import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'
import Button from './ui/Button'

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
        className="absolute inset-0 liquid-glass-backdrop"
        onClick={onCancel}
      />

      {/* Modal */}
      <form
        onSubmit={handleSubmit}
        className="relative liquid-glass-modal w-96 p-5"
      >
        <h3 className="liquid-glass-text text-lg mb-4">Summon a God</h3>

        {/* God selector */}
        <div className="mb-4">
          <label className="block liquid-glass-text-muted text-sm mb-1.5">God</label>
          <div className="relative">
            <select
              value={selectedGod}
              onChange={(e) => setSelectedGod(e.target.value)}
              className="w-full liquid-glass-select px-3 py-2.5 appearance-none"
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
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
            </div>
          </div>
        </div>

        {/* Task input */}
        <div className="mb-4">
          <label className="block liquid-glass-text-muted text-sm mb-1.5">
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
            className="w-full liquid-glass-input px-3 py-2.5 resize-none"
          />
          <p className="liquid-glass-text-muted text-xs mt-1.5 opacity-60">
            Enter to summon · Ctrl+Enter for newline
          </p>
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="glass"
            size="md"
            color={godColors[selectedGod] || '#888'}
          >
            Summon
          </Button>
        </div>
      </form>
    </div>
  )
}
