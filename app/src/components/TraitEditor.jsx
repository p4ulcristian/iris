import { useState, useEffect, useRef, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSave, faPuzzlePiece, faPenToSquare, faEye, faArrowLeft } from '@fortawesome/free-solid-svg-icons'
import { useWebSocket } from '../hooks/useWebSocket'
import { WS_URL } from '../config'

export default function TraitEditor({
  entity,           // Standalone mode (from entity spawn)
  trait: traitProp, // Embedded mode (direct data from parent)
  onBack            // Back navigation callback (embedded mode)
}) {
  const { send } = useWebSocket(WS_URL)
  const editorRef = useRef(null)
  const contentRef = useRef('')

  // Determine data source - embedded mode takes priority
  const trait = traitProp || entity?.data?.trait || {}
  const isNew = trait.isNew || false
  const isBundled = trait.source === 'bundled'

  const [traitName, setTraitName] = useState(trait.name || '')
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [isEditing, setIsEditing] = useState(isNew)

  // Keep ref in sync with content
  useEffect(() => { contentRef.current = content }, [content])
  const [isLoading, setIsLoading] = useState(!isNew)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [saveMessage, setSaveMessage] = useState(null)

  // Load trait content on mount
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

  // Handle WebSocket responses
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

  // Track changes
  useEffect(() => {
    setHasChanges(content !== originalContent || (isNew && traitName))
  }, [content, originalContent, isNew, traitName])

  const handleEditorMount = (editor) => {
    editorRef.current = editor
  }

  const handleSave = useCallback(() => {
    const name = isNew ? traitName : trait.name
    if (!name.trim()) {
      setSaveMessage('Trait name required')
      setTimeout(() => setSaveMessage(null), 2000)
      return
    }

    setIsSaving(true)
    send({
      event: 'traits:save',
      name: name.trim(),
      content
    })
  }, [send, isNew, traitName, trait.name, content])

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

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-white/10 bg-black/20">
        {/* Back button (embedded mode) */}
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-white/60 hover:text-white hover:bg-white/10 rounded transition-colors"
            title="Back"
          >
            <FontAwesomeIcon icon={faArrowLeft} size="sm" />
          </button>
        )}

        <FontAwesomeIcon icon={faPuzzlePiece} className="text-purple-400" />

        {isNew ? (
          <input
            type="text"
            value={traitName}
            onChange={(e) => setTraitName(e.target.value)}
            placeholder="Trait name..."
            className="flex-1 bg-transparent text-white text-sm font-medium outline-none border-b border-white/20 focus:border-purple-400 py-1"
          />
        ) : (
          <span className="flex-1 text-white text-sm font-medium">{trait.name}</span>
        )}

        {/* Source badge */}
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          isBundled
            ? 'bg-blue-500/20 text-blue-300'
            : 'bg-green-500/20 text-green-300'
        }`}>
          {isBundled ? 'bundled' : 'user'}
        </span>

        {/* View/Edit toggle */}
        <button
          onClick={() => setIsEditing(!isEditing)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors ${
            isEditing
              ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'
              : 'bg-white/10 text-white/70 hover:bg-white/20'
          }`}
          title={isEditing ? 'Preview' : 'Edit'}
        >
          <FontAwesomeIcon icon={isEditing ? faEye : faPenToSquare} size="xs" />
          {isEditing ? 'Preview' : 'Edit'}
        </button>

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
            title={isBundled ? 'Save as user copy (Ctrl+S)' : 'Save (Ctrl+S)'}
          >
            <FontAwesomeIcon icon={faSave} size="xs" />
            {isSaving ? 'Saving...' : (isBundled && hasChanges ? 'Save Copy' : 'Save')}
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
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-white/40">
            Loading...
          </div>
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
          <div className="h-full overflow-y-auto p-8">
            <div className="max-w-3xl mx-auto markdown-body">
              <Markdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({children}) => <h1 className="text-2xl font-bold text-white mb-4 pb-3 border-b border-white/10">{children}</h1>,
                  h2: ({children}) => <h2 className="text-xl font-semibold text-white mt-8 mb-3">{children}</h2>,
                  h3: ({children}) => <h3 className="text-lg font-semibold text-white mt-6 mb-2">{children}</h3>,
                  p: ({children}) => <p className="text-white/80 leading-relaxed mb-4">{children}</p>,
                  ul: ({children}) => <ul className="text-white/80 mb-4 ml-4 space-y-1 list-disc">{children}</ul>,
                  ol: ({children}) => <ol className="text-white/80 mb-4 ml-4 space-y-1 list-decimal">{children}</ol>,
                  li: ({children}) => <li className="text-white/80">{children}</li>,
                  strong: ({children}) => <strong className="text-white font-semibold">{children}</strong>,
                  em: ({children}) => <em className="text-white/70 italic">{children}</em>,
                  a: ({href, children}) => <a href={href} className="text-purple-400 hover:text-purple-300 hover:underline">{children}</a>,
                  code: ({inline, children}) => inline
                    ? <code className="text-purple-300 bg-white/10 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
                    : <code className="text-purple-300">{children}</code>,
                  pre: ({children}) => <pre className="bg-black/50 border border-white/10 rounded-lg p-4 mb-4 overflow-x-auto font-mono text-sm">{children}</pre>,
                  blockquote: ({children}) => <blockquote className="border-l-4 border-purple-500 pl-4 my-4 text-white/60 italic">{children}</blockquote>,
                  hr: () => <hr className="border-white/10 my-8" />,
                  table: ({children}) => <table className="w-full border-collapse mb-4 text-sm">{children}</table>,
                  thead: ({children}) => <thead className="border-b border-white/20">{children}</thead>,
                  tbody: ({children}) => <tbody>{children}</tbody>,
                  tr: ({children}) => <tr className="border-b border-white/10">{children}</tr>,
                  th: ({children}) => <th className="text-left text-white/90 font-semibold py-2 px-3">{children}</th>,
                  td: ({children}) => <td className="text-white/70 py-2 px-3">{children}</td>,
                }}
              >
                {content}
              </Markdown>
            </div>
          </div>
        )}
      </div>

      {/* Footer hint for bundled */}
      {isBundled && hasChanges && (
        <div className="px-4 py-2 border-t border-white/10 bg-black/20 text-xs text-white/40">
          Changes will be saved as a user copy (won't modify bundled version).
        </div>
      )}
    </div>
  )
}
