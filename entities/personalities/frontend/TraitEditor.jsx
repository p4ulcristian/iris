import { useState, useEffect, useRef, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { faArrowLeft, faSave, faEye, faPenToSquare } from '@fortawesome/free-solid-svg-icons'
import { IconButton, ActionButton, Card } from '../../_ui'
import { MarkdownRenderer } from '../../_ui'
import { useWebSocket } from '@/hooks/useWebSocket'
import { WS_URL } from '@/config'

export default function TraitEditor({ trait, onBack }) {
  const { send } = useWebSocket(WS_URL)
  const editorRef = useRef(null)
  const contentRef = useRef('')

  const isNew = trait?.isNew || false
  const isBundled = trait?.source === 'bundled'

  const [traitName, setTraitName] = useState(trait?.name || '')
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [isEditing, setIsEditing] = useState(isNew)
  const [isLoading, setIsLoading] = useState(!isNew)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [saveMessage, setSaveMessage] = useState(null)

  useEffect(() => { contentRef.current = content }, [content])

  useEffect(() => {
    if (isNew) {
      setContent('# New Trait\n\nAdd your trait instructions here.\n')
      setOriginalContent('')
      setIsLoading(false)
      return
    }
    if (trait?.name) send({ event: 'traits:get', name: trait.name })
  }, [trait?.name, isNew, send])

  useEffect(() => {
    const handleMessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.event === 'traits:get:response' && msg.name === trait?.name) {
          setContent(msg.content || '')
          setOriginalContent(msg.content || '')
          setIsLoading(false)
        }
        if (msg.event === 'traits:save:response') {
          setIsSaving(false)
          setOriginalContent(contentRef.current)
          setHasChanges(false)
          setSaveMessage('Saved!')
          setTimeout(() => setSaveMessage(null), 2000)
        }
        if (msg.event === 'traits:error') {
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
  }, [trait?.name])

  useEffect(() => {
    setHasChanges(content !== originalContent || (isNew && traitName))
  }, [content, originalContent, isNew, traitName])

  const handleSave = useCallback(() => {
    const name = isNew ? traitName : trait?.name
    if (!name?.trim()) {
      setSaveMessage('Name required')
      setTimeout(() => setSaveMessage(null), 2000)
      return
    }
    setIsSaving(true)
    send({ event: 'traits:save', name: name.trim(), content })
  }, [send, isNew, traitName, trait?.name, content])

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

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 shrink-0">
          <IconButton icon={faArrowLeft} onClick={onBack} title="Back" className="text-text-tertiary hover:text-text-primary" />
          <div className="flex-1 min-w-0">
            {isNew ? (
              <input
                type="text"
                value={traitName}
                onChange={(e) => setTraitName(e.target.value)}
                placeholder="Trait name..."
                className="text-lg font-medium text-text-primary bg-transparent border-b border-white/20 focus:border-accent/50 outline-none w-full"
              />
            ) : (
              <h1 className="text-lg font-medium text-text-primary truncate">{trait?.name}</h1>
            )}
            <p className="text-sm text-text-tertiary">{isBundled ? 'Bundled' : 'User'} trait</p>
          </div>
          <ActionButton
            variant="ghost"
            icon={isEditing ? faEye : faPenToSquare}
            onClick={() => setIsEditing(!isEditing)}
            compact
          >
            {isEditing ? 'Preview' : 'Edit'}
          </ActionButton>
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

        {/* Content */}
        <div className="flex-1 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-text-tertiary">Loading...</div>
          ) : (
            <Card className="h-full overflow-hidden p-0">
              {isEditing ? (
                <Editor
                  height="100%"
                  language="markdown"
                  theme="vs-dark"
                  value={content}
                  onChange={(value) => setContent(value || '')}
                  onMount={(editor) => { editorRef.current = editor }}
                  options={{
                    fontSize: 14,
                    fontFamily: 'JetBrains Mono, monospace',
                    minimap: { enabled: false },
                    lineNumbers: 'on',
                    wordWrap: 'on',
                    scrollBeyondLastLine: false,
                    padding: { top: 16, bottom: 16 },
                  }}
                />
              ) : (
                <div className="h-full overflow-y-auto p-6">
                  <MarkdownRenderer content={content} />
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
