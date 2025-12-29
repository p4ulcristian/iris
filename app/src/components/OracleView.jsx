import { useState, useEffect, useRef, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faRotate,
  faPaperPlane,
  faCircle,
  faExclamationTriangle,
  faChevronDown,
  faTrash
} from '@fortawesome/free-solid-svg-icons'
import { useStore } from '../store'

const OLLAMA_BASE = 'http://localhost:11434'

function MessageBubble({ message, isUser }) {
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 ${
          isUser
            ? 'bg-accent/30 text-text-primary rounded-br-md'
            : 'bg-white/10 text-text-primary rounded-bl-md'
        }`}
      >
        <div className="text-sm whitespace-pre-wrap">{message.content}</div>
      </div>
    </div>
  )
}

function ModelSelector({ models, selectedModel, onSelect, loading, onRefresh }) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-black/30 border border-white/10 hover:border-white/20 transition-colors disabled:opacity-50"
      >
        <span className="text-text-primary">{selectedModel || 'Select model'}</span>
        <FontAwesomeIcon icon={faChevronDown} className="text-xs opacity-50" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-bg-secondary border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <span className="text-xs text-text-tertiary">Available Models</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRefresh()
              }}
              className="p-1 hover:bg-white/10 rounded transition-colors"
              title="Refresh models"
            >
              <FontAwesomeIcon icon={faRotate} className={`text-xs text-text-tertiary ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {models.length === 0 ? (
              <div className="px-3 py-4 text-sm text-text-tertiary text-center">
                No models found
              </div>
            ) : (
              models.map((model) => (
                <button
                  key={model.name}
                  onClick={() => {
                    onSelect(model.name)
                    setOpen(false)
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-white/10 transition-colors ${
                    selectedModel === model.name ? 'bg-accent/20 text-accent' : 'text-text-primary'
                  }`}
                >
                  <div className="font-medium">{model.name}</div>
                  {model.details?.parameter_size && (
                    <div className="text-xs text-text-tertiary mt-0.5">
                      {model.details.parameter_size}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function OracleView({ entityId }) {
  const entity = useStore((s) => s.entities[entityId])
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState('')
  const [loading, setLoading] = useState(false)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState(null)
  const [connected, setConnected] = useState(false)
  const messagesContainerRef = useRef(null)
  const inputRef = useRef(null)

  const scrollToBottom = useCallback(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const fetchModels = useCallback(async () => {
    setModelsLoading(true)
    setError(null)
    try {
      const response = await fetch(`${OLLAMA_BASE}/api/tags`)
      if (!response.ok) throw new Error('Failed to fetch models')
      const data = await response.json()
      setModels(data.models || [])
      setConnected(true)
      if (data.models?.length > 0 && !selectedModel) {
        setSelectedModel(data.models[0].name)
      }
    } catch (err) {
      setError('Cannot connect to Ollama. Is it running on localhost:11434?')
      setConnected(false)
      setModels([])
    } finally {
      setModelsLoading(false)
    }
  }, [selectedModel])

  useEffect(() => {
    fetchModels()
  }, [fetchModels])

  const sendMessage = async () => {
    if (!input.trim() || !selectedModel || streaming) return

    const userMessage = { role: 'user', content: input.trim() }
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setStreaming(true)
    setError(null)

    const assistantMessage = { role: 'assistant', content: '' }
    setMessages((prev) => [...prev, assistantMessage])

    try {
      const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          messages: [...messages, userMessage],
          stream: true
        })
      })

      if (!response.ok) throw new Error('Failed to send message')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let content = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(Boolean)

        for (const line of lines) {
          try {
            const data = JSON.parse(line)
            // Only show content, not thinking (qwen3 outputs thinking first, then content)
            if (data.message?.content) {
              content += data.message.content
              setMessages((prev) => {
                const updated = [...prev]
                updated[updated.length - 1] = { role: 'assistant', content }
                return updated
              })
            }
          } catch (e) {
            // Ignore parse errors for incomplete chunks
          }
        }
      }
    } catch (err) {
      setError(err.message)
      setMessages((prev) => prev.slice(0, -1)) // Remove empty assistant message
    } finally {
      setStreaming(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    setMessages([])
    setError(null)
  }

  if (!entity) return null

  return (
    <div className="absolute inset-0 flex flex-col bg-bg-primary/50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <span className="text-lg">🔮</span>
          <span className="text-text-primary font-medium">Oracle</span>
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs ${
            connected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            <FontAwesomeIcon icon={faCircle} className="text-[6px]" />
            {connected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ModelSelector
            models={models}
            selectedModel={selectedModel}
            onSelect={setSelectedModel}
            loading={modelsLoading}
            onRefresh={fetchModels}
          />
          <button
            onClick={clearChat}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            title="Clear chat"
          >
            <FontAwesomeIcon icon={faTrash} className="text-text-tertiary" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-text-tertiary">
            <span className="text-4xl mb-4">🔮</span>
            <div className="text-lg mb-2">The Oracle awaits your question</div>
            <div className="text-sm opacity-70">
              {connected
                ? `Using ${selectedModel || 'no model selected'}`
                : 'Connecting to Ollama...'}
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <MessageBubble key={idx} message={msg} isUser={msg.role === 'user'} />
          ))
        )}
        {streaming && (
          <div className="flex items-center gap-2 text-text-tertiary text-sm">
            <FontAwesomeIcon icon={faRotate} className="animate-spin" />
            <span>Oracle is thinking...</span>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 px-3 py-2 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          {error}
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={connected ? 'Ask the Oracle...' : 'Waiting for Ollama...'}
            disabled={!connected || streaming}
            className="flex-1 px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-text-primary placeholder-text-tertiary resize-none focus:outline-none focus:border-accent/50 disabled:opacity-50"
            rows={1}
            style={{ minHeight: '48px', maxHeight: '120px' }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || !selectedModel || streaming || !connected}
            className="px-4 py-3 bg-accent/30 hover:bg-accent/40 disabled:bg-white/10 disabled:opacity-50 rounded-xl transition-colors"
          >
            <FontAwesomeIcon
              icon={faPaperPlane}
              className={streaming ? 'text-text-tertiary' : 'text-accent'}
            />
          </button>
        </div>
      </div>
    </div>
  )
}
