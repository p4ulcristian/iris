import { useState, useEffect, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSave, faPlug, faArrowLeft, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons'
import { useWebSocket } from '@/hooks/useWebSocket'
import { WS_URL } from '@/config'

export default function McpServerEditor({
  entity,             // Standalone mode (from entity spawn)
  server: serverProp, // Embedded mode (direct data from parent)
  onBack              // Back navigation callback (embedded mode)
}) {
  const { send } = useWebSocket(WS_URL)

  // Determine data source - embedded mode takes priority
  const server = serverProp || entity?.data?.server || {}
  const isNew = server.isNew || false
  const isBundled = server.source === 'bundled'

  const [serverName, setServerName] = useState(server.name || '')
  const [description, setDescription] = useState(server.config?.description || '')
  const [command, setCommand] = useState(server.config?.command || '')
  const [args, setArgs] = useState(server.config?.args || [])
  const [envVars, setEnvVars] = useState(
    Object.entries(server.config?.env || {}).map(([key, value]) => ({ key, value }))
  )

  const [originalConfig, setOriginalConfig] = useState(null)
  const [isLoading, setIsLoading] = useState(!isNew)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [saveMessage, setSaveMessage] = useState(null)

  // Load MCP server config on mount
  useEffect(() => {
    if (isNew) {
      setOriginalConfig(null)
      setIsLoading(false)
      return
    }

    if (server.name) {
      send({ event: 'mcp-servers:get', name: server.name })
    }
  }, [server.name, isNew, send])

  // Handle WebSocket responses
  useEffect(() => {
    const handleMessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        if (msg.event === 'mcp-servers:get:response' && msg.name === server.name) {
          const config = msg.config || {}
          setDescription(config.description || '')
          setCommand(config.command || '')
          setArgs(config.args || [])
          setEnvVars(
            Object.entries(config.env || {}).map(([key, value]) => ({ key, value }))
          )
          setOriginalConfig(config)
          setIsLoading(false)
        }

        if (msg.event === 'mcp-servers:save:response') {
          setIsSaving(false)
          setOriginalConfig(buildConfig())
          setHasChanges(false)
          setSaveMessage('Saved!')
          setTimeout(() => setSaveMessage(null), 2000)
        }

        if (msg.event === 'mcp-servers:error') {
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
  }, [server.name])

  // Build config object from form state
  const buildConfig = useCallback(() => {
    const config = {
      name: isNew ? serverName : server.name,
      description: description.trim(),
      command: command.trim(),
      args: args.filter(a => a.trim())
    }

    // Only include env if there are non-empty entries
    const envObj = {}
    envVars.forEach(({ key, value }) => {
      if (key.trim() && value.trim()) {
        envObj[key.trim()] = value.trim()
      }
    })
    if (Object.keys(envObj).length > 0) {
      config.env = envObj
    }

    return config
  }, [isNew, serverName, server.name, description, command, args, envVars])

  // Track changes
  useEffect(() => {
    if (isNew) {
      setHasChanges(serverName.trim() && command.trim())
      return
    }

    if (!originalConfig) {
      setHasChanges(false)
      return
    }

    const currentConfig = buildConfig()
    const changed = JSON.stringify(currentConfig) !== JSON.stringify({
      ...originalConfig,
      name: server.name
    })
    setHasChanges(changed)
  }, [serverName, description, command, args, envVars, originalConfig, isNew, buildConfig, server.name])

  const handleSave = useCallback(() => {
    const name = isNew ? serverName : server.name
    if (!name.trim()) {
      setSaveMessage('Server name required')
      setTimeout(() => setSaveMessage(null), 2000)
      return
    }

    if (!command.trim()) {
      setSaveMessage('Command required')
      setTimeout(() => setSaveMessage(null), 2000)
      return
    }

    setIsSaving(true)
    send({
      event: 'mcp-servers:save',
      name: name.trim(),
      config: buildConfig()
    })
  }, [send, isNew, serverName, server.name, command, buildConfig])

  // Args management
  const addArg = () => setArgs([...args, ''])
  const updateArg = (index, value) => {
    const newArgs = [...args]
    newArgs[index] = value
    setArgs(newArgs)
  }
  const removeArg = (index) => {
    setArgs(args.filter((_, i) => i !== index))
  }

  // Env vars management
  const addEnvVar = () => setEnvVars([...envVars, { key: '', value: '' }])
  const updateEnvVar = (index, field, value) => {
    const newEnvVars = [...envVars]
    newEnvVars[index][field] = value
    setEnvVars(newEnvVars)
  }
  const removeEnvVar = (index) => {
    setEnvVars(envVars.filter((_, i) => i !== index))
  }

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

        <FontAwesomeIcon icon={faPlug} className="text-cyan-400" />

        <span className="flex-1 text-white text-sm font-medium">
          {isNew ? 'New MCP Server' : server.name}
        </span>

        {/* Source badge */}
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          isBundled
            ? 'bg-blue-500/20 text-blue-300'
            : 'bg-green-500/20 text-green-300'
        }`}>
          {isBundled ? 'bundled' : 'user'}
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
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-white/40">
          Loading...
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Name (only for new servers) */}
          {isNew && (
            <div>
              <label className="block text-xs text-white/60 mb-1">Server Name</label>
              <input
                type="text"
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                placeholder="my-mcp-server"
                className="w-full bg-white/5 text-white text-sm rounded px-3 py-2 outline-none border border-white/10 focus:border-cyan-400"
              />
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs text-white/60 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this MCP server do?"
              className="w-full bg-white/5 text-white text-sm rounded px-3 py-2 outline-none border border-white/10 focus:border-cyan-400"
            />
          </div>

          {/* Command */}
          <div>
            <label className="block text-xs text-white/60 mb-1">Command</label>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="bunx, npx, node, python, etc."
              className="w-full bg-white/5 text-white text-sm font-mono rounded px-3 py-2 outline-none border border-white/10 focus:border-cyan-400"
            />
          </div>

          {/* Arguments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-white/60">Arguments</label>
              <button
                onClick={addArg}
                className="flex items-center gap-1 px-2 py-1 text-[10px] bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 rounded transition-colors"
              >
                <FontAwesomeIcon icon={faPlus} size="xs" />
                Add
              </button>
            </div>
            {args.length === 0 ? (
              <div className="text-xs text-white/40 py-2">
                No arguments. Click "Add" to add one.
              </div>
            ) : (
              <div className="space-y-2">
                {args.map((arg, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={arg}
                      onChange={(e) => updateArg(index, e.target.value)}
                      placeholder={`Argument ${index + 1}`}
                      className="flex-1 bg-white/5 text-white text-sm font-mono rounded px-3 py-2 outline-none border border-white/10 focus:border-cyan-400"
                    />
                    <button
                      onClick={() => removeArg(index)}
                      className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-red-400 hover:bg-white/10 rounded transition-colors"
                    >
                      <FontAwesomeIcon icon={faTrash} size="xs" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Environment Variables */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-white/60">Environment Variables</label>
              <button
                onClick={addEnvVar}
                className="flex items-center gap-1 px-2 py-1 text-[10px] bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 rounded transition-colors"
              >
                <FontAwesomeIcon icon={faPlus} size="xs" />
                Add
              </button>
            </div>
            {envVars.length === 0 ? (
              <div className="text-xs text-white/40 py-2">
                No environment variables. Click "Add" to add one.
              </div>
            ) : (
              <div className="space-y-2">
                {envVars.map((envVar, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={envVar.key}
                      onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
                      placeholder="KEY"
                      className="w-1/3 bg-white/5 text-white text-sm font-mono rounded px-3 py-2 outline-none border border-white/10 focus:border-cyan-400"
                    />
                    <span className="text-white/40">=</span>
                    <input
                      type="text"
                      value={envVar.value}
                      onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                      placeholder="value"
                      className="flex-1 bg-white/5 text-white text-sm font-mono rounded px-3 py-2 outline-none border border-white/10 focus:border-cyan-400"
                    />
                    <button
                      onClick={() => removeEnvVar(index)}
                      className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-red-400 hover:bg-white/10 rounded transition-colors"
                    >
                      <FontAwesomeIcon icon={faTrash} size="xs" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="pt-4 border-t border-white/10">
            <label className="block text-xs text-white/60 mb-2">Command Preview</label>
            <div className="bg-black/40 rounded p-3 font-mono text-xs text-white/80 overflow-x-auto">
              {command || 'command'} {args.filter(a => a.trim()).join(' ')}
            </div>
          </div>
        </div>
      )}

      {/* Footer hint for bundled */}
      {isBundled && hasChanges && (
        <div className="px-4 py-2 border-t border-white/10 bg-black/20 text-xs text-white/40">
          Changes will be saved as a user copy (won't modify bundled version).
        </div>
      )}
    </div>
  )
}
