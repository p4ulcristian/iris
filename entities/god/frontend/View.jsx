import { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react'
import { useWebSocket } from '@/hooks/useWebSocket'
import { WS_URL } from '@/config'
import { useStore } from '@/store'
import { MarkdownRenderer, ToolCard, TodoCard, EditCard, WriteCard } from '../../_ui'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSpinner, faCodeBranch } from '@fortawesome/free-solid-svg-icons'

// Isolated input component - doesn't re-render when parent state changes
const InputBar = memo(function InputBar({ connected, onSend, isFocused, onType, onInterrupt }) {
  const [input, setInput] = useState('')
  const inputRef = useRef(null)

  // Auto-focus when pane is focused
  useEffect(() => {
    if (isFocused && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isFocused])

  const handleSend = () => {
    if (!input.trim() || !connected) return
    onSend(input.trim())
    setInput('')
  }

  const handleChange = (e) => {
    setInput(e.target.value)
    onType()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSend()
    if (e.key === 'Escape') onInterrupt()
  }

  return (
    <div className="p-2 border-t border-white/10">
      <input
        ref={inputRef}
        value={input}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={connected ? "Message..." : "Connecting..."}
        disabled={!connected}
        className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30 disabled:opacity-50"
      />
    </div>
  )
})

function GodView({ entity, isFocused }) {
  // Server state - single source of truth
  const [godState, setGodState] = useState({
    history: [],
    streaming: false,
    result: null,
    error: null,
    exited: null,
  })

  const [viewMode, setViewMode] = useState('pro')

  const scrollRef = useRef(null)
  const lastStateSeq = useRef(0)  // Track last seen sequence to ignore stale states
  const godName = entity?.id
  const { connected, send, request } = useWebSocket(WS_URL)
  const gitBranches = useStore(s => s.gitBranches)
  const branch = entity?.project ? gitBranches[entity.project] : null

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

  // Restore scroll position on mount
  useEffect(() => {
    if (godName && scrollRef.current) {
      const saved = localStorage.getItem(`iris-god-scroll-${godName}`)
      if (saved) {
        scrollRef.current.scrollTop = parseInt(saved, 10)
      }
    }
  }, [godName])

  // Save scroll position on scroll (debounced)
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !godName) return

    let timeout
    const handleScroll = () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        localStorage.setItem(`iris-god-scroll-${godName}`, el.scrollTop.toString())
      }, 200)
    }

    el.addEventListener('scroll', handleScroll)
    return () => {
      clearTimeout(timeout)
      el.removeEventListener('scroll', handleScroll)
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

    // Reset sequence tracker for new god
    lastStateSeq.current = 0

    let currentWs = null

    const handler = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.event === 'god:state' && msg.godName === godName) {
          // Ignore stale states (out-of-order messages)
          if (msg.stateSeq && msg.stateSeq <= lastStateSeq.current) {
            return
          }
          lastStateSeq.current = msg.stateSeq || 0

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

  const handleSend = useCallback((text) => {
    send({ event: 'god:send', godName, text })
  }, [send, godName])

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [])

  const handleInterrupt = useCallback(() => {
    send({ event: 'god:interrupt', godName })
  }, [send, godName])

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
        <div key={i} className="flex justify-start mb-3 min-w-0">
          <div className="max-w-[85%] min-w-0 overflow-hidden">
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
                if (t.name === 'Write') {
                  return (
                    <div key={j} className="mt-2">
                      <WriteCard
                        filePath={t.input?.file_path}
                        content={t.input?.content}
                        result={result}
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
          {entity?.project && (
            <span className="px-2 py-0.5 rounded text-xs bg-white/10 text-white/50" title={entity.project}>
              {entity.project.split('/').pop()}
            </span>
          )}
          {branch && (
            <span className="px-2 py-0.5 rounded text-xs bg-white/10 text-white/50 font-mono flex items-center gap-1">
              <FontAwesomeIcon icon={faCodeBranch} size="xs" />
              {branch}
            </span>
          )}
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

      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden p-3" style={{ userSelect: 'text', WebkitUserSelect: 'text', cursor: 'text' }}>
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

      <InputBar connected={connected} onSend={handleSend} isFocused={isFocused} onType={scrollToBottom} onInterrupt={handleInterrupt} />
    </div>
  )
}

export default memo(GodView)
