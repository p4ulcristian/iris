import { useState, useEffect, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSave, faFolder, faArrowLeft } from '@fortawesome/free-solid-svg-icons'
import { useWebSocket } from '@/hooks/useWebSocket'
import { WS_URL } from '@/config'

export default function ProjectEditor({ project, onBack }) {
  const { send } = useWebSocket(WS_URL)

  const isNew = project?.isNew || false

  const [projectName, setProjectName] = useState(project?.name || '')
  const [projectPath, setProjectPath] = useState(project?.path || '')
  const [description, setDescription] = useState(project?.description || '')
  const [originalDescription, setOriginalDescription] = useState(project?.description || '')

  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [saveMessage, setSaveMessage] = useState(null)

  // Load project details if not new
  useEffect(() => {
    if (!isNew && project?.name) {
      send({ event: 'projects:get', name: project.name })
    }
  }, [project?.name, isNew, send])

  // Handle WebSocket responses
  useEffect(() => {
    const handleMessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        if (msg.event === 'projects:get:response' && msg.name === project?.name) {
          setProjectPath(msg.path || '')
          setDescription(msg.description || '')
          setOriginalDescription(msg.description || '')
        }

        if (msg.event === 'projects:save:response') {
          setIsSaving(false)
          setOriginalDescription(description)
          setHasChanges(false)
          setSaveMessage('Saved!')
          setTimeout(() => setSaveMessage(null), 2000)
        }

        if (msg.event === 'projects:error') {
          setIsSaving(false)
          setSaveMessage(`Error: ${msg.error}`)
          setTimeout(() => setSaveMessage(null), 3000)
        }
      } catch {}
    }

    const ws = window.__irisWs
    if (ws) {
      ws.addEventListener('message', handleMessage)
      return () => ws.removeEventListener('message', handleMessage)
    }
  }, [project?.name, description])

  // Track changes
  useEffect(() => {
    const descriptionChanged = description !== originalDescription
    const nameValid = isNew ? projectName.trim() : true
    setHasChanges((descriptionChanged || isNew) && nameValid)
  }, [description, originalDescription, isNew, projectName])

  const handleSave = useCallback(() => {
    const name = isNew ? projectName.trim() : project?.name
    if (!name) {
      setSaveMessage('Project name required')
      setTimeout(() => setSaveMessage(null), 2000)
      return
    }

    if (!projectPath) {
      setSaveMessage('Project path required')
      setTimeout(() => setSaveMessage(null), 2000)
      return
    }

    setIsSaving(true)
    send({
      event: 'projects:save',
      name,
      path: projectPath,
      description: description.trim(),
      isDefault: project?.isDefault || false
    })
  }, [send, isNew, projectName, project?.name, projectPath, description, project?.isDefault])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (hasChanges) {
          handleSave()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave, hasChanges])

  // Shorten path for display
  const shortPath = projectPath?.replace(/^\/home\/[^/]+/, '~') || ''

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-white/10 bg-black/20">
        {/* Back button */}
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-white/60 hover:text-white hover:bg-white/10 rounded transition-colors"
            title="Back"
          >
            <FontAwesomeIcon icon={faArrowLeft} size="sm" />
          </button>
        )}

        <FontAwesomeIcon icon={faFolder} className="text-blue-400" />

        <span className="flex-1 text-white text-sm font-medium">
          {isNew ? 'New Project' : project?.name}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors ${
              hasChanges
                ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                : 'bg-white/5 text-white/30 cursor-not-allowed'
            }`}
            title="Save (Ctrl+S)"
          >
            <FontAwesomeIcon icon={faSave} size="xs" />
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>

        {/* Save message */}
        {saveMessage && (
          <span className={`text-xs ${
            saveMessage.startsWith('Error') ? 'text-red-400' : 'text-green-400'
          }`}>
            {saveMessage}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Name field (only for new projects) */}
        {isNew && (
          <div>
            <label className="block text-xs text-white/60 mb-1">Project Name</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="my-project"
              className="w-full bg-white/5 text-white text-sm rounded px-3 py-2 outline-none border border-white/10 focus:border-blue-400"
            />
          </div>
        )}

        {/* Path (read-only) */}
        <div>
          <label className="block text-xs text-white/60 mb-1">Path</label>
          <div className="w-full bg-white/5 text-white/70 text-sm rounded px-3 py-2 border border-white/10 font-mono">
            {shortPath || 'No path selected'}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs text-white/60 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this project about?"
            rows={4}
            className="w-full bg-white/5 text-white text-sm rounded px-3 py-2 outline-none border border-white/10 focus:border-blue-400 resize-none"
          />
        </div>
      </div>
    </div>
  )
}
