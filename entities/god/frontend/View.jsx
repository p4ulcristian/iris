import { useState, useEffect, useRef, useMemo, memo } from 'react'
import { WS_URL } from '@/config'
import { MarkdownRenderer, ToolCard } from '../../_ui'

function GodView({ entity, isFocused }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState(null)
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('') // Accumulates text deltas
  const [viewMode, setViewMode] = useState(() => {
    return localStorage.getItem('iris-god-viewMode') || 'pro'
  })

  const wsRef = useRef(null)
  const scrollRef = useRef(null)
  const godName = entity?.id

  // Auto-scroll on new content
  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [messages, streamingText])

  // WebSocket
  useEffect(() => {
    if (!godName) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('[GodView] WebSocket connected, sending attach for:', godName)
      setConnected(true)
      ws.send(JSON.stringify({ event: 'god:attach', godName }))
    }

    ws.onclose = () => setConnected(false)

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.godName && msg.godName !== godName) return

        if (msg.event === 'god:history') {
          // Filter out stream_event from history, keep final messages
          const filtered = (msg.history || []).filter(m => m.type !== 'stream_event')
          setMessages(filtered)
          setStreaming(msg.streaming || false)
        } else if (msg.event === 'god:init') {
          setStatus(`Connected: ${msg.model}`)
        } else if (msg.event === 'god:message') {
          const m = msg.message

          // Handle streaming events - accumulate text deltas
          if (m.type === 'stream_event') {
            const evt = m.event
            if (evt?.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
              setStreamingText(prev => prev + evt.delta.text)
              setStreaming(true)
            } else if (evt?.type === 'message_stop') {
              // Stream complete, clear streaming text (final message will follow)
              setStreamingText('')
            }
            // Don't add stream_event to messages
            return
          }

          // Final assistant message - add to messages
          if (m.type === 'assistant') {
            setStreamingText('') // Clear streaming text
            setStreaming(false)
          }

          setMessages(prev => [...prev, m])
          setStreaming(msg.partial || false)
        } else if (msg.event === 'god:result') {
          setStreaming(false)
          setStreamingText('')
          setStatus(msg.success ? `Done ($${msg.cost?.toFixed(4)})` : 'Error')
        } else if (msg.event === 'god:stderr') {
          setMessages(prev => [...prev, { type: 'stderr', content: msg.stderr }])
        } else if (msg.event === 'god:error') {
          setStatus(`Error: ${msg.error}`)
        } else if (msg.event === 'god:exited') {
          setStatus(`Exited (${msg.code})`)
        } else if (msg.event === 'god:user') {
          // User message from initial task or other source
          setMessages(prev => [...prev, { type: 'user', content: msg.text }])
          setStreaming(true)
        }
      } catch {}
    }

    return () => ws.close()
  }, [godName])

  const handleSend = () => {
    if (!input.trim() || !wsRef.current || !connected) return
    // Don't add to messages here - server broadcasts god:user which adds it
    wsRef.current.send(JSON.stringify({ event: 'god:send', godName, text: input.trim() }))
    setInput('')
    setStreamingText('')
  }

  const renderMsg = (msg, i) => {
    // JSON mode - show raw JSON for everything
    if (viewMode === 'json') {
      return (
        <div key={i} className="mb-2">
          <pre className="p-2 bg-black/40 rounded text-xs font-mono text-green-400 overflow-x-auto">
            {JSON.stringify(msg, null, 2)}
          </pre>
        </div>
      )
    }

    // Skip user messages with tool_result - they're shown inline with ToolCard
    if (msg.type === 'user' && msg.message?.content) {
      const hasToolResult = msg.message.content.some(c => c.type === 'tool_result')
      if (hasToolResult) return null
    }

    // User message - right side bubble
    if (msg.type === 'user' && msg.content) {
      return (
        <div key={i} className="flex justify-end mb-3">
          <div className="max-w-[75%] px-4 py-2 rounded-2xl rounded-br-sm text-sm text-white shadow-lg" style={{ backgroundColor: '#2563eb' }}>
            {msg.content}
          </div>
        </div>
      )
    }

    // Stderr - centered warning
    if (msg.type === 'stderr') {
      return (
        <div key={i} className="flex justify-center mb-3">
          <pre className="max-w-[85%] p-2 bg-yellow-500/10 rounded-lg text-xs font-mono text-yellow-400">
            {msg.content}
          </pre>
        </div>
      )
    }

    // Assistant message - left side bubble
    if (msg.type === 'assistant' && msg.message?.content) {
      const text = msg.message.content.filter(c => c.type === 'text').map(c => c.text).join('')
      const tools = msg.message.content.filter(c => c.type === 'tool_use')

      // In chat mode, skip messages that have no text (only tool calls)
      if (viewMode === 'chat' && !text) return null

      // Find tool results from subsequent messages
      const getToolResult = (toolUseId) => {
        // Look in following messages for tool_result
        for (let j = i + 1; j < messages.length; j++) {
          const nextMsg = messages[j]
          if (nextMsg.type === 'user' && nextMsg.message?.content) {
            const results = nextMsg.message.content.filter(c => c.type === 'tool_result')
            const match = results.find(r => r.tool_use_id === toolUseId)
            if (match) return match
          }
        }
        return null
      }

      return (
        <div key={i} className="flex justify-start mb-3">
          <div className="max-w-[85%]">
            {text && (
              <div className="px-4 py-2 bg-white/10 rounded-2xl rounded-bl-md text-sm">
                <MarkdownRenderer content={text} />
              </div>
            )}
            {viewMode === 'pro' && tools.map((t, j) => {
              const result = getToolResult(t.id)
              return (
                <div key={j} className="mt-2">
                  <ToolCard name={t.name} input={t.input} result={result} />
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    // Default fallback - centered
    return (
      <div key={i} className="flex justify-center mb-3">
        <div className="text-sm text-white/50">{JSON.stringify(msg).slice(0, 200)}</div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-black/20" style={{ userSelect: 'text', WebkitUserSelect: 'text' }}>
      <div className="p-2 border-b border-white/10 flex justify-between items-center">
        <div className="flex items-center gap-2 text-sm text-white/70">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          {entity?.name}
          <button
            onClick={() => {
              const modes = ['chat', 'pro', 'json']
              const next = modes[(modes.indexOf(viewMode) + 1) % modes.length]
              setViewMode(next)
              localStorage.setItem('iris-god-viewMode', next)
            }}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              viewMode === 'json'
                ? 'bg-green-600 text-green-100'
                : viewMode === 'pro'
                  ? 'bg-purple-600 text-purple-100'
                  : 'bg-blue-600 text-blue-100'
            }`}
          >
            {viewMode === 'json' ? 'JSON' : viewMode === 'pro' ? 'Pro' : 'Chat'}
          </button>
          {streaming && <span className="text-purple-400 animate-pulse">...</span>}
        </div>
        {status && <span className="text-xs text-white/50">{status}</span>}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3" style={{ userSelect: 'text', WebkitUserSelect: 'text', cursor: 'text' }}>
        {messages.length === 0 && !streamingText && (
          <div className="text-white/30 text-sm text-center mt-4">Type a message to start</div>
        )}
        {useMemo(() => messages.map(renderMsg), [messages, viewMode])}

        {/* Live streaming text - left side like Claude */}
        {streamingText && (
          <div className="flex justify-start mb-3">
            <div className="max-w-[85%] px-4 py-2 bg-white/10 rounded-2xl rounded-bl-md text-sm border border-purple-500/30">
              <MarkdownRenderer content={streamingText} />
              <span className="inline-block w-2 h-4 bg-purple-400 ml-1 animate-pulse" />
            </div>
          </div>
        )}
      </div>

      <div className="p-2 border-t border-white/10">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={connected ? "Message..." : "Connecting..."}
          disabled={!connected}
          className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30 disabled:opacity-50"
        />
      </div>
    </div>
  )
}

export default memo(GodView)
