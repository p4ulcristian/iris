import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'
import { useWebSocket } from '../hooks/useWebSocket'
import { WS_URL } from '../config'
import Button from './ui/Button'

const PERMISSION_MODES = [
  { value: 'bypass', label: 'Bypass', description: 'Full autonomy' },
  { value: 'bypass-plan', label: 'Plan First', description: 'Plan with agent, then implement' },
]

export default function SummonModal({
  isOpen,
  onSummon,
  onCancel
}) {
  const [selectedGod, setSelectedGod] = useState('')
  const [task, setTask] = useState('')
  const [selectedPersonality, setSelectedPersonality] = useState('god')
  const [personalities, setPersonalities] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [projects, setProjects] = useState([])
  const [permissionMode, setPermissionMode] = useState(null)
  const inputRef = useRef(null)
  const godColors = useStore(s => s.godColors)
  const entities = useStore(s => s.entities)
  const { send, lastMessage } = useWebSocket(WS_URL)

  // All gods always available (infinite gods with numbering)
  const allGods = Object.keys(godColors)

  // Get base names of currently spawned gods (zeus-2 → zeus)
  const usedBaseNames = new Set(
    Object.values(entities)
      .filter(e => e.type === 'god')
      .map(e => e.id.toLowerCase().replace(/-?\d+$/, '').trim())
  )
  const availableGods = allGods.filter(g => !usedBaseNames.has(g))

  // Fetch personalities and projects on open
  useEffect(() => {
    if (isOpen) {
      send({ event: 'personalities:list' })
      send({ event: 'projects:list' })
    }
  }, [isOpen, send])

  // Handle personality list response
  useEffect(() => {
    if (lastMessage?.event === 'personalities:list:response') {
      setPersonalities(lastMessage.personalities || [])
      // Set default permission mode from server (single source of truth)
      if (lastMessage.defaults?.permissionMode && !permissionMode) {
        setPermissionMode(lastMessage.defaults.permissionMode)
      }
    }
  }, [lastMessage, permissionMode])

  // Handle projects list response
  useEffect(() => {
    if (lastMessage?.event === 'projects:list:response') {
      const projectList = lastMessage.projects || []
      setProjects(projectList)
      // Select the default project, or first one if none is default
      const defaultProject = projectList.find(p => p.isDefault)
      setSelectedProject(defaultProject?.name || projectList[0]?.name || null)
    }
  }, [lastMessage])

  // Pick random god on open (prefer unused gods first)
  useEffect(() => {
    if (isOpen && allGods.length > 0 && !selectedGod) {
      const pool = availableGods.length > 0 ? availableGods : allGods
      const randomGod = pool[Math.floor(Math.random() * pool.length)]
      setSelectedGod(randomGod)
    }
  }, [isOpen, allGods, availableGods, selectedGod])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setTask('')
      setSelectedPersonality('god')
      // Focus input after a brief delay for modal animation
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      // Reset state when modal closes so it picks fresh values next time
      setSelectedGod('')
      setPermissionMode(null)
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
    // Use selectedGod or fall back to first available god
    const god = selectedGod || allGods[0]
    if (!god) return
    const name = god.charAt(0).toUpperCase() + god.slice(1)
    onSummon(name, task.trim(), selectedPersonality, selectedProject, permissionMode)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop - no click to close, use Escape or Cancel button */}
      <div className="absolute inset-0 liquid-glass-backdrop" />

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
              {allGods.map(god => (
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

        {/* Personality selector */}
        <div className="mb-4">
          <label className="block liquid-glass-text-muted text-sm mb-1.5">Personality</label>
          <div className="relative">
            <select
              value={selectedPersonality}
              onChange={(e) => setSelectedPersonality(e.target.value)}
              className="w-full liquid-glass-select px-3 py-2.5 appearance-none"
            >
              <option value="none">None (no system prompt)</option>
              {personalities.map(p => (
                <option key={p.name} value={p.name}>
                  {p.name} {p.source === 'bundled' ? '(bundled)' : ''} {p.type === 'traits' ? `[${p.traits?.length || 0} traits]` : ''}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
            </div>
          </div>

          {/* Show traits and MCP servers for selected personality */}
          {(() => {
            const selected = personalities.find(p => p.name === selectedPersonality)
            if (selected?.type === 'traits') {
              return (
                <>
                  {selected.traits?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {selected.traits.map(trait => (
                        <span
                          key={trait}
                          className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300"
                        >
                          {trait}
                        </span>
                      ))}
                    </div>
                  )}
                  {selected.mcpServers?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {selected.mcpServers.map(server => (
                        <span
                          key={server}
                          className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300"
                        >
                          {server}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )
            }
            if (selectedPersonality === 'none') {
              return (
                <p className="liquid-glass-text-muted text-xs mt-1.5 opacity-60">
                  Pure Claude with no customization
                </p>
              )
            }
            if (selected?.type === 'legacy') {
              return (
                <p className="liquid-glass-text-muted text-xs mt-1.5 opacity-60">
                  Legacy personality (monolithic)
                </p>
              )
            }
            return null
          })()}
        </div>

        {/* Project selector */}
        {projects.length > 0 && (
          <div className="mb-4">
            <label className="block liquid-glass-text-muted text-sm mb-1.5">Project</label>
            <div className="relative">
              <select
                value={selectedProject || ''}
                onChange={(e) => setSelectedProject(e.target.value || null)}
                className="w-full liquid-glass-select px-3 py-2.5 appearance-none"
              >
                {projects.map(p => (
                  <option key={p.name} value={p.name}>
                    {p.name} {p.isDefault ? '(default)' : ''}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
              </div>
            </div>
            {(() => {
              const selected = projects.find(p => p.name === selectedProject)
              if (selected?.path) {
                return (
                  <p className="liquid-glass-text-muted text-xs mt-1.5 opacity-60 truncate">
                    {selected.path.replace(/^\/home\/[^/]+/, '~')}
                  </p>
                )
              }
              return null
            })()}
          </div>
        )}

        {/* Permission mode selector */}
        {permissionMode && (
          <div className="mb-4">
            <label className="block liquid-glass-text-muted text-sm mb-1.5">Mode</label>
            <div className="flex gap-1.5">
              {PERMISSION_MODES.map(mode => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setPermissionMode(mode.value)}
                  className={`flex-1 px-2 py-1.5 rounded text-xs transition-all ${
                    permissionMode === mode.value
                      ? 'bg-white/20 text-white'
                      : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <p className="liquid-glass-text-muted text-xs mt-1.5 opacity-60">
              {PERMISSION_MODES.find(m => m.value === permissionMode)?.description}
            </p>
          </div>
        )}

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
