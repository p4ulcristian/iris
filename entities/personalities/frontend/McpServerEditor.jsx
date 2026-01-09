import { useState, useEffect, useCallback } from 'react'
import { faArrowLeft, faSave, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons'
import { IconButton, ActionButton, Card } from '../../_ui'
import { useWebSocket } from '@/hooks/useWebSocket'
import { WS_URL } from '@/config'

export default function McpServerEditor({ server, onBack }) {
  const { send } = useWebSocket(WS_URL)

  const isNew = server?.isNew || false
  const isBundled = server?.source === 'bundled'

  const [serverName, setServerName] = useState(server?.name || '')
  const [description, setDescription] = useState(server?.config?.description || '')
  const [command, setCommand] = useState(server?.config?.command || '')
  const [args, setArgs] = useState(server?.config?.args || [])
  const [envVars, setEnvVars] = useState(
    Object.entries(server?.config?.env || {}).map(([key, value]) => ({ key, value }))
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
    if (server?.name) send({ event: 'mcp-servers:get', name: server.name })
  }, [server?.name, isNew, send])

  useEffect(() => {
    const handleMessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.event === 'mcp-servers:get:response' && msg.name === server?.name) {
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
  }, [server?.name])

  const buildConfig = useCallback(() => {
    const config = {
      name: isNew ? serverName : server?.name,
      description: description.trim(),
      command: command.trim(),
      args: args.filter(a => a.trim())
    }
    const envObj = {}
    envVars.forEach(({ key, value }) => {
      if (key.trim() && value.trim()) envObj[key.trim()] = value.trim()
    })
    if (Object.keys(envObj).length > 0) config.env = envObj
    return config
  }, [isNew, serverName, server?.name, description, command, args, envVars])

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
    setHasChanges(JSON.stringify(currentConfig) !== JSON.stringify({ ...originalConfig, name: server?.name }))
  }, [serverName, description, command, args, envVars, originalConfig, isNew, buildConfig, server?.name])

  const handleSave = useCallback(() => {
    const name = isNew ? serverName : server?.name
    if (!name?.trim()) {
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
  }, [send, isNew, serverName, server?.name, command, buildConfig])

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

  const inputClass = "w-full bg-black/30 text-text-primary text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-accent/50 focus:outline-none"

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <IconButton icon={faArrowLeft} onClick={onBack} title="Back" className="text-text-tertiary hover:text-text-primary" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-medium text-text-primary truncate">
              {isNew ? 'New MCP Server' : server?.name}
            </h1>
            <p className="text-sm text-text-tertiary">{isBundled ? 'Bundled' : 'User'} server</p>
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

        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-text-tertiary">Loading...</div>
        ) : (
          <div className="space-y-6">
            {/* Basic Info */}
            <Card>
              <div className="space-y-4">
                {isNew && (
                  <div>
                    <label className="block text-xs text-text-tertiary mb-1.5">Name</label>
                    <input type="text" value={serverName} onChange={(e) => setServerName(e.target.value)} placeholder="my-mcp-server" className={inputClass} />
                  </div>
                )}
                <div>
                  <label className="block text-xs text-text-tertiary mb-1.5">Description</label>
                  <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this server do?" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs text-text-tertiary mb-1.5">Command</label>
                  <input type="text" value={command} onChange={(e) => setCommand(e.target.value)} placeholder="bunx, npx, node, python..." className={`${inputClass} font-mono`} />
                </div>
              </div>
            </Card>

            {/* Arguments */}
            <Card>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-text-secondary">Arguments</label>
                <ActionButton variant="ghost" icon={faPlus} onClick={() => setArgs([...args, ''])} compact>Add</ActionButton>
              </div>
              {args.length === 0 ? (
                <p className="text-sm text-text-tertiary">No arguments.</p>
              ) : (
                <div className="space-y-2">
                  {args.map((arg, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="text" value={arg} onChange={(e) => { const a = [...args]; a[i] = e.target.value; setArgs(a) }} placeholder={`Arg ${i + 1}`} className={`${inputClass} font-mono flex-1`} />
                      <IconButton icon={faTrash} onClick={() => setArgs(args.filter((_, j) => j !== i))} title="Remove" className="text-text-tertiary hover:text-red-400" />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Environment Variables */}
            <Card>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-text-secondary">Environment Variables</label>
                <ActionButton variant="ghost" icon={faPlus} onClick={() => setEnvVars([...envVars, { key: '', value: '' }])} compact>Add</ActionButton>
              </div>
              {envVars.length === 0 ? (
                <p className="text-sm text-text-tertiary">No environment variables.</p>
              ) : (
                <div className="space-y-2">
                  {envVars.map((env, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="text" value={env.key} onChange={(e) => { const v = [...envVars]; v[i].key = e.target.value; setEnvVars(v) }} placeholder="KEY" className={`${inputClass} font-mono w-1/3`} />
                      <span className="text-text-tertiary">=</span>
                      <input type="text" value={env.value} onChange={(e) => { const v = [...envVars]; v[i].value = e.target.value; setEnvVars(v) }} placeholder="value" className={`${inputClass} font-mono flex-1`} />
                      <IconButton icon={faTrash} onClick={() => setEnvVars(envVars.filter((_, j) => j !== i))} title="Remove" className="text-text-tertiary hover:text-red-400" />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Preview */}
            <Card>
              <label className="block text-sm font-medium text-text-secondary mb-2">Command Preview</label>
              <div className="bg-black/30 rounded-lg p-3 font-mono text-sm text-text-secondary overflow-x-auto">
                {command || 'command'} {args.filter(a => a.trim()).join(' ')}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
