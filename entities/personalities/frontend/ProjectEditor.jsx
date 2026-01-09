import { useState, useEffect, useCallback } from 'react'
import { faArrowLeft, faSave } from '@fortawesome/free-solid-svg-icons'
import { IconButton, ActionButton, Card } from '../../_ui'
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

  useEffect(() => {
    if (!isNew && project?.name) send({ event: 'projects:get', name: project.name })
  }, [project?.name, isNew, send])

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

  useEffect(() => {
    const descriptionChanged = description !== originalDescription
    const nameValid = isNew ? projectName.trim() : true
    setHasChanges((descriptionChanged || isNew) && nameValid)
  }, [description, originalDescription, isNew, projectName])

  const handleSave = useCallback(() => {
    const name = isNew ? projectName.trim() : project?.name
    if (!name) {
      setSaveMessage('Name required')
      setTimeout(() => setSaveMessage(null), 2000)
      return
    }
    if (!projectPath) {
      setSaveMessage('Path required')
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

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (hasChanges) handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave, hasChanges])

  const shortPath = projectPath?.replace(/^\/home\/[^/]+/, '~') || ''
  const inputClass = "w-full bg-black/30 text-text-primary text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-accent/50 focus:outline-none"

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <IconButton icon={faArrowLeft} onClick={onBack} title="Back" className="text-text-tertiary hover:text-text-primary" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-medium text-text-primary truncate">
              {isNew ? 'New Project' : project?.name}
            </h1>
            <p className="text-sm text-text-tertiary font-mono">{shortPath || 'No path'}</p>
          </div>
          <ActionButton
            variant={hasChanges ? 'accent' : 'ghost'}
            icon={faSave}
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            compact
          >
            {isSaving ? 'Saving...' : 'Save'}
          </ActionButton>
          {saveMessage && (
            <span className={`text-sm ${saveMessage.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
              {saveMessage}
            </span>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <div className="space-y-4">
              {isNew && (
                <div>
                  <label className="block text-xs text-text-tertiary mb-1.5">Name</label>
                  <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="my-project" className={inputClass} />
                </div>
              )}
              <div>
                <label className="block text-xs text-text-tertiary mb-1.5">Path</label>
                <div className="bg-black/30 text-text-secondary text-sm rounded-lg px-3 py-2 border border-white/10 font-mono">
                  {shortPath || 'No path selected'}
                </div>
              </div>
              <div>
                <label className="block text-xs text-text-tertiary mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this project about?"
                  rows={4}
                  className={`${inputClass} resize-none`}
                />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
