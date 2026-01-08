import { useState, useEffect, useRef, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSave, faPenToSquare, faEye, faArrowLeft } from '@fortawesome/free-solid-svg-icons'
import { useWebSocket } from '@/hooks/useWebSocket'
import { WS_URL } from '@/config'
import { MarkdownRenderer } from '../../_ui'

export default function TraitEditor({ entity, trait: traitProp, onBack }) {
  const { send } = useWebSocket(WS_URL)
  const editorRef = useRef(null)
  const contentRef = useRef('')

  const trait = traitProp || entity?.data?.trait || {}
  const isNew = trait.isNew || false
  const isBundled = trait.source === 'bundled'

  const [traitName, setTraitName] = useState(trait.name || '')
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [isEditing, setIsEditing] = useState(isNew)

  useEffect(() => { contentRef.current = content }, [content])
  const [isLoading, setIsLoading] = useState(!isNew)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [saveMessage, setSaveMessage] = useState(null)

  useEffect(() => {
    if (isNew) {
      setContent('# New Trait\n\nAdd your trait instructions here.\n')
      setOriginalContent('')
      setIsLoading(false)
      return
    }

    if (trait.name) {
      send({ event: 'traits:get', name: trait.name })
    }
  }, [trait.name, isNew, send])

  useEffect(() => {
    const handleMessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        if (msg.event === 'traits:get:response' && msg.name === trait.name) {
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
  }, [trait.name])

  useEffect(() => {
    setHasChanges(content !== originalContent || (isNew && traitName))
  }, [content, originalContent, isNew, traitName])

  const handleEditorMount = (editor) => {
    editorRef.current = editor
  }

  const handleSave = useCallback(() => {
    const name = isNew ? traitName : trait.name
    if (!name.trim()) {
      setSaveMessage('Name required')
      setTimeout(() => setSaveMessage(null), 2000)
      return
    }

    setIsSaving(true)
    send({ event: 'traits:save', name: name.trim(), content })
  }, [send, isNew, traitName, trait.name, content])

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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center justify-center w-8 h-8 text-text-tertiary hover:text-text-primary hover:bg-white/10 rounded-lg transition-colors"
          >
            <FontAwesomeIcon icon={faArrowLeft} />
          </button>
        )}
        <div className="flex-1">
          {isNew ? (
            <input
              type="text"
              value={traitName}
              onChange={(e) => setTraitName(e.target.value)}
              placeholder="Trait name..."
              className="text-xl font-medium text-text-primary bg-transparent border-b border-white/20 focus:border-accent/50 outline-none w-full"
            />
          ) : (
            <h1 className="text-xl font-medium text-text-primary">{trait.name}</h1>
          )}
          <p className="text-sm text-text-tertiary">{isBundled ? 'Bundled' : 'User'} trait</p>
        </div>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${
            isEditing
              ? 'bg-white/10 text-text-primary'
              : 'bg-white/5 text-text-secondary hover:bg-white/10'
          }`}
        >
          <FontAwesomeIcon icon={isEditing ? faEye : faPenToSquare} size="sm" />
          {isEditing ? 'Preview' : 'Edit'}
        </button>
        <button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors ${
            hasChanges
              ? 'bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30'
              : 'bg-white/5 text-text-tertiary border border-white/10 cursor-not-allowed'
          }`}
        >
          <FontAwesomeIcon icon={faSave} />
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        {saveMessage && (
          <span className={`text-sm ${saveMessage.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
            {saveMessage}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden rounded-lg border border-white/10">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-text-tertiary">Loading...</div>
        ) : isEditing ? (
          <Editor
            height="100%"
            language="markdown"
            theme="vs-dark"
            value={content}
            onChange={(value) => setContent(value || '')}
            onMount={handleEditorMount}
            options={{
              fontSize: 14,
              fontFamily: 'JetBrains Mono, monospace',
              minimap: { enabled: false },
              lineNumbers: 'on',
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              padding: { top: 16 },
            }}
          />
        ) : (
          <div className="h-full overflow-y-auto p-6">
            <MarkdownRenderer content={content} />
          </div>
        )}
      </div>
    </div>
  )
}
