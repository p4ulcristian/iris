import { useState, useEffect, useRef, useMemo, memo } from 'react'
import { useWebSocket } from '@/hooks/useWebSocket'
import { WS_URL } from '@/config'
import { MarkdownRenderer, ToolCard, TodoCard, EditCard } from '../../_ui'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSpinner } from '@fortawesome/free-solid-svg-icons'

function GodView({ entity, isFocused }) {
  // Server state - single source of truth
  const [godState, setGodState] = useState({
    history: [],
    streaming: false,
    result: null,
    error: null,
    exited: null,
  })

  const [input, setInput] = useState('')
  const [viewMode, setViewMode] = useState('pro')

  const scrollRef = useRef(null)
  const godName = entity?.id
  const { connected, send, request } = useWebSocket(WS_URL)

  // Helper to fetch file content for EditCard
  const requestFile = async (filePath) => {
    try {
      const response = await request('file:read', { path: filePath })
      return response.ok ? response.content : null
    } catch {
      return null
    }
  }

  // Load view mode per god
  useEffect(() => {
    if (godName) {
      const saved = localStorage.getItem(`iris-god-viewMode-${godName}`)
      if (saved) setViewMode(saved)
    }
  }, [godName])

  // Filter out stream_event from history
  const messages = useMemo(() =>
    (godState.history || []).filter(m => m.type !== 'stream_event'),
    [godState.history]
  )

  // Extract latest TodoWrite for pinned display
  const latestTodos = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.type === 'assistant' && msg.message?.content) {
        const todoTool = msg.message.content.find(c => c.type === 'tool_use' && c.name === 'TodoWrite')
        if (todoTool?.input?.todos) return todoTool.input.todos
      }
    }
    return null
  }, [messages])

  // Auto-scroll only if already near bottom
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const threshold = 100
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    if (isNearBottom) {
      el.scrollTo(0, el.scrollHeight)
    }
  }, [messages])

  // Subscribe directly to god:state messages for THIS god
  // (Can't use lastMessage because state:sync overwrites it)
  useEffect(() => {
    if (!godName) return

    let currentWs = null

    const handler = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.event === 'god:state' && msg.godName === godName) {
          setGodState({
            history: msg.history || [],
            streaming: msg.streaming || false,
            result: msg.result || null,
            error: msg.error || null,
            exited: msg.exited,
          })
        }
      } catch (e) {}
    }

    const checkWs = () => {
      const ws = window.__irisWs
      if (ws !== currentWs) {
        if (currentWs) currentWs.removeEventListener('message', handler)
        if (ws) ws.addEventListener('message', handler)
        currentWs = ws
      }
    }

    checkWs()
    const interval = setInterval(checkWs, 500)

    return () => {
      clearInterval(interval)
      if (currentWs) currentWs.removeEventListener('message', handler)
    }
  }, [godName])

  // Attach to god on mount or reconnect
  useEffect(() => {
    if (!godName || !connected) return
    console.log(`[GodView] Attaching to ${godName}`)
    send({ event: 'god:attach', godName })
  }, [godName, connected, send])

  const handleSend = () => {
    if (!input.trim() || !connected) return
    send({ event: 'god:send', godName, text: input.trim() })
    setInput('')
  }

  // Status from server state
  const status = godState.result
    ? (godState.result.success ? `Done ($${godState.result.cost?.toFixed(4)})` : 'Error')
    : godState.error
      ? `Error: ${godState.error}`
      : godState.exited !== null && godState.exited !== undefined
        ? `Exited (${godState.exited})`
        : null

  const renderMsg = (msg, i) => {
    // JSON mode
    if (viewMode === 'json') {
      return (
        <div key={i} className="mb-2">
          <pre className="p-2 bg-black/40 rounded text-xs font-mono text-green-400 overflow-x-auto">
            {JSON.stringify(msg, null, 2)}
          </pre>
        </div>
      )
    }

    // Skip user messages with tool_result
    if (msg.type === 'user' && msg.message?.content) {
      const hasToolResult = msg.message.content.some(c => c.type === 'tool_result')
      if (hasToolResult) return null
    }

    // User message
    if (msg.type === 'user' && msg.content) {
      return (
        <div key={i} className="flex justify-end mb-3">
          <div className="max-w-[75%] px-4 py-2 rounded-2xl rounded-br-sm text-sm text-white shadow-lg" style={{ backgroundColor: '#2563eb' }}>
            {msg.content}
          </div>
        </div>
      )
    }

    // Stderr
    if (msg.type === 'stderr') {
      return (
        <div key={i} className="flex justify-center mb-3">
          <pre className="max-w-[85%] p-2 bg-yellow-500/10 rounded-lg text-xs font-mono text-yellow-400">
            {msg.content}
          </pre>
        </div>
      )
    }

    // Assistant message
    if (msg.type === 'assistant' && msg.message?.content) {
      const text = msg.message.content.filter(c => c.type === 'text').map(c => c.text).join('')
      const tools = msg.message.content.filter(c => c.type === 'tool_use')

      if (viewMode === 'chat' && !text) return null

      const getToolResult = (toolUseId) => {
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
            {viewMode === 'pro' && tools
              .filter(t => t.name !== 'TodoWrite')
              .map((t, j) => {
                const result = getToolResult(t.id)
                if (t.name === 'Edit') {
                  return (
                    <div key={j} className="mt-2">
                      <EditCard
                        filePath={t.input?.file_path}
                        oldString={t.input?.old_string}
                        newString={t.input?.new_string}
                        result={result}
                        onRequestFile={requestFile}
                      />
                    </div>
                  )
                }
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

    return null
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
              if (godName) localStorage.setItem(`iris-god-viewMode-${godName}`, next)
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
          {godState.streaming && <span className="text-purple-400 animate-pulse">...</span>}
        </div>
        {status && <span className="text-xs text-white/50">{status}</span>}
      </div>

      {viewMode !== 'json' && latestTodos && (
        <div className="p-2 border-b border-white/10">
          <TodoCard todos={latestTodos} />
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3" style={{ userSelect: 'text', WebkitUserSelect: 'text', cursor: 'text' }}>
        {messages.length === 0 && (
          <div className="text-white/30 text-sm text-center mt-4">Type a message to start</div>
        )}
        {messages.map(renderMsg)}
      </div>

      {godState.streaming && (
        <div className="flex justify-center py-2">
          <FontAwesomeIcon icon={faSpinner} className="text-purple-400 animate-spin" />
        </div>
      )}

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
