import { useState, useEffect, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSave, faArrowLeft, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons'
import { useWebSocket } from '@/hooks/useWebSocket'
import { WS_URL } from '@/config'

export default function McpServerEditor({ entity, server: serverProp, onBack }) {
  const { send } = useWebSocket(WS_URL)

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

  useEffect(() => {
    const handleMessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        if (msg.event === 'mcp-servers:get:response' && msg.name === server.name) {
          const config = msg.config || {}
          setDescription(config.description || '')
          setCommand(config.command || '')
          setArgs(config.args || [])
          setEnvVars(Object.entries(config.env || {}).map(([key, value]) => ({ key, value })))
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

  const buildConfig = useCallback(() => {
    const config = {
      name: isNew ? serverName : server.name,
      description: description.trim(),
      command: command.trim(),
      args: args.filter(a => a.trim())
    }

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
    const changed = JSON.stringify(currentConfig) !== JSON.stringify({ ...originalConfig, name: server.name })
    setHasChanges(changed)
  }, [serverName, description, command, args, envVars, originalConfig, isNew, buildConfig, server.name])

  const handleSave = useCallback(() => {
    const name = isNew ? serverName : server.name
    if (!name.trim()) {
      setSaveMessage('Name required')
      setTimeout(() => setSaveMessage(null), 2000)
      return
    }

    if (!command.trim()) {
      setSaveMessage('Command required')
      setTimeout(() => setSaveMessage(null), 2000)
      return
    }

    setIsSaving(true)
    send({ event: 'mcp-servers:save', name: name.trim(), config: buildConfig() })
  }, [send, isNew, serverName, server.name, command, buildConfig])

  const addArg = () => setArgs([...args, ''])
  const updateArg = (index, value) => {
    const newArgs = [...args]
    newArgs[index] = value
    setArgs(newArgs)
  }
  const removeArg = (index) => setArgs(args.filter((_, i) => i !== index))

  const addEnvVar = () => setEnvVars([...envVars, { key: '', value: '' }])
  const updateEnvVar = (index, field, value) => {
    const newEnvVars = [...envVars]
    newEnvVars[index][field] = value
    setEnvVars(newEnvVars)
  }
  const removeEnvVar = (index) => setEnvVars(envVars.filter((_, i) => i !== index))

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
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center justify-center w-8 h-8 text-text-tertiary hover:text-text-primary hover:bg-white/10 rounded-lg transition-colors"
          >
            <FontAwesomeIcon icon={faArrowLeft} />
          </button>
        )}
        <div className="flex-1">
          <h1 className="text-xl font-medium text-text-primary">
            {isNew ? 'New MCP Server' : server.name}
          </h1>
          <p className="text-sm text-text-tertiary">{isBundled ? 'Bundled' : 'User'} server</p>
        </div>
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

      {isLoading ? (
        <div className="flex items-center justify-center h-32 text-text-tertiary">Loading...</div>
      ) : (
        <div className="space-y-6">
          {/* Name */}
          {isNew && (
            <div>
              <label className="block text-xs text-text-tertiary mb-1">Name</label>
              <input
                type="text"
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                placeholder="my-mcp-server"
                className="w-full bg-black/20 text-text-primary text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-accent/50 focus:outline-none"
              />
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs text-text-tertiary mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this server do?"
              className="w-full bg-black/20 text-text-primary text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-accent/50 focus:outline-none"
            />
          </div>

          {/* Command */}
          <div>
            <label className="block text-xs text-text-tertiary mb-1">Command</label>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="bunx, npx, node, python..."
              className="w-full bg-black/20 text-text-primary text-sm font-mono rounded-lg px-3 py-2 border border-white/10 focus:border-accent/50 focus:outline-none"
            />
          </div>

          {/* Arguments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-text-tertiary">Arguments</label>
              <button
                onClick={addArg}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-white/5 text-text-secondary hover:bg-white/10 border border-white/10 rounded-lg transition-colors"
              >
                <FontAwesomeIcon icon={faPlus} size="xs" />
                Add
              </button>
            </div>
            {args.length === 0 ? (
              <p className="text-sm text-text-tertiary">No arguments.</p>
            ) : (
              <div className="space-y-2">
                {args.map((arg, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={arg}
                      onChange={(e) => updateArg(index, e.target.value)}
                      placeholder={`Arg ${index + 1}`}
                      className="flex-1 bg-black/20 text-text-primary text-sm font-mono rounded-lg px-3 py-2 border border-white/10 focus:border-accent/50 focus:outline-none"
                    />
                    <button
                      onClick={() => removeArg(index)}
                      className="w-8 h-8 flex items-center justify-center text-text-tertiary hover:text-red-400 hover:bg-white/10 rounded-lg transition-colors"
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
              <label className="text-xs text-text-tertiary">Environment Variables</label>
              <button
                onClick={addEnvVar}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-white/5 text-text-secondary hover:bg-white/10 border border-white/10 rounded-lg transition-colors"
              >
                <FontAwesomeIcon icon={faPlus} size="xs" />
                Add
              </button>
            </div>
            {envVars.length === 0 ? (
              <p className="text-sm text-text-tertiary">No environment variables.</p>
            ) : (
              <div className="space-y-2">
                {envVars.map((envVar, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={envVar.key}
                      onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
                      placeholder="KEY"
                      className="w-1/3 bg-black/20 text-text-primary text-sm font-mono rounded-lg px-3 py-2 border border-white/10 focus:border-accent/50 focus:outline-none"
                    />
                    <span className="text-text-tertiary">=</span>
                    <input
                      type="text"
                      value={envVar.value}
                      onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                      placeholder="value"
                      className="flex-1 bg-black/20 text-text-primary text-sm font-mono rounded-lg px-3 py-2 border border-white/10 focus:border-accent/50 focus:outline-none"
                    />
                    <button
                      onClick={() => removeEnvVar(index)}
                      className="w-8 h-8 flex items-center justify-center text-text-tertiary hover:text-red-400 hover:bg-white/10 rounded-lg transition-colors"
                    >
                      <FontAwesomeIcon icon={faTrash} size="xs" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Command Preview */}
          <div className="pt-4 border-t border-white/10">
            <label className="block text-xs text-text-tertiary mb-2">Command Preview</label>
            <div className="bg-black/30 rounded-lg p-3 font-mono text-sm text-text-secondary overflow-x-auto">
              {command || 'command'} {args.filter(a => a.trim()).join(' ')}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
