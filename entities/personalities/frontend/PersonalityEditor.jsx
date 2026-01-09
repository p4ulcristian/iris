import { useState, useEffect, useCallback } from 'react'
import { faArrowLeft, faSave, faPenToSquare } from '@fortawesome/free-solid-svg-icons'
import { IconButton, ActionButton, Card } from '../../_ui'
import { useWebSocket } from '@/hooks/useWebSocket'
import { WS_URL } from '@/config'

export default function PersonalityEditor({ personality, onBack, onOpenTrait }) {
  const { send } = useWebSocket(WS_URL)

  const isNew = personality?.isNew || false
  const isBundled = personality?.source === 'bundled'

  const [personalityName, setPersonalityName] = useState(personality?.name || '')
  const [description, setDescription] = useState(personality?.description || '')

  const [availableTraits, setAvailableTraits] = useState([])
  const [enabledTraits, setEnabledTraits] = useState(personality?.traits || [])
  const [originalEnabledTraits, setOriginalEnabledTraits] = useState([])

  const [availableMcpServers, setAvailableMcpServers] = useState([])
  const [enabledMcpServers, setEnabledMcpServers] = useState(personality?.mcpServers || [])
  const [originalEnabledMcpServers, setOriginalEnabledMcpServers] = useState([])

  const [isLoading, setIsLoading] = useState(!isNew)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [saveMessage, setSaveMessage] = useState(null)

  useEffect(() => {
    send({ event: 'traits:list' })
    send({ event: 'mcp-servers:list' })

    if (isNew) {
      setEnabledTraits([])
      setOriginalEnabledTraits([])
      setEnabledMcpServers([])
      setOriginalEnabledMcpServers([])
      setIsLoading(false)
      return
    }
    if (personality?.name) send({ event: 'personalities:get', name: personality.name })
  }, [personality?.name, isNew, send])

  useEffect(() => {
    const handleMessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.event === 'traits:list:response') setAvailableTraits(msg.traits || [])
        if (msg.event === 'mcp-servers:list:response') setAvailableMcpServers(msg.servers || [])
        if (msg.event === 'personalities:get:response' && msg.name === personality?.name) {
          setEnabledTraits(msg.config?.traits || [])
          setOriginalEnabledTraits(msg.config?.traits || [])
          setEnabledMcpServers(msg.config?.mcpServers || [])
          setOriginalEnabledMcpServers(msg.config?.mcpServers || [])
          setDescription(msg.config?.description || '')
          setIsLoading(false)
        }
        if (msg.event === 'personalities:save:response') {
          setIsSaving(false)
          setOriginalEnabledTraits([...enabledTraits])
          setOriginalEnabledMcpServers([...enabledMcpServers])
          setHasChanges(false)
          setSaveMessage('Saved!')
          setTimeout(() => setSaveMessage(null), 2000)
        }
        if (msg.event === 'personalities:error') {
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
  }, [personality?.name, enabledTraits, enabledMcpServers])

  useEffect(() => {
    const traitsChanged = JSON.stringify([...enabledTraits].sort()) !== JSON.stringify([...originalEnabledTraits].sort())
    const mcpChanged = JSON.stringify([...enabledMcpServers].sort()) !== JSON.stringify([...originalEnabledMcpServers].sort())
    setHasChanges(traitsChanged || mcpChanged || (isNew && personalityName))
  }, [enabledTraits, originalEnabledTraits, enabledMcpServers, originalEnabledMcpServers, isNew, personalityName])

  const handleSave = useCallback(() => {
    const name = isNew ? personalityName : personality?.name
    if (!name?.trim()) {
      setSaveMessage('Name required')
      setTimeout(() => setSaveMessage(null), 2000)
      return
    }
    setIsSaving(true)
    send({
      event: 'personalities:save',
      name: name.trim(),
      type: 'traits',
      config: { name: name.trim(), description: description.trim(), traits: enabledTraits, mcpServers: enabledMcpServers }
    })
  }, [send, isNew, personalityName, personality?.name, enabledTraits, enabledMcpServers, description])

  const toggleTrait = (name) => setEnabledTraits(prev => prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name])
  const toggleMcpServer = (name) => setEnabledMcpServers(prev => prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name])

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
              {isNew ? 'New Personality' : personality?.name}
            </h1>
            <p className="text-sm text-text-tertiary">{isBundled ? 'Bundled' : 'User'} personality</p>
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
                    <input type="text" value={personalityName} onChange={(e) => setPersonalityName(e.target.value)} placeholder="my-personality" className={inputClass} />
                  </div>
                )}
                <div>
                  <label className="block text-xs text-text-tertiary mb-1.5">Description</label>
                  <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description..." className={inputClass} />
                </div>
              </div>
            </Card>

            {/* Traits */}
            <Card>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-text-secondary">
                  Traits <span className="text-text-tertiary font-normal">({enabledTraits.length} selected)</span>
                </label>
              </div>
              {availableTraits.length === 0 ? (
                <p className="text-sm text-text-tertiary">No traits available.</p>
              ) : (
                <div className="space-y-2">
                  {availableTraits.map((trait) => (
                    <div
                      key={trait.name}
                      onClick={() => toggleTrait(trait.name)}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                        enabledTraits.includes(trait.name)
                          ? 'bg-accent/10 border border-accent/30'
                          : 'bg-black/20 border border-white/10 hover:bg-white/5'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={enabledTraits.includes(trait.name)}
                        onChange={() => toggleTrait(trait.name)}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-accent"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-text-primary">{trait.name}</span>
                          {trait.source === 'bundled' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-text-tertiary border border-white/10">bundled</span>
                          )}
                        </div>
                        {trait.preview && <p className="text-xs text-text-tertiary truncate mt-0.5 font-mono">{trait.preview}</p>}
                      </div>
                      {onOpenTrait && (
                        <IconButton
                          icon={faPenToSquare}
                          onClick={(e) => { e.stopPropagation(); onOpenTrait(trait) }}
                          title="Edit trait"
                          className="text-text-tertiary hover:text-text-primary"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* MCP Servers */}
            <Card>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-text-secondary">
                  MCP Servers <span className="text-text-tertiary font-normal">({enabledMcpServers.length} selected)</span>
                </label>
              </div>
              {availableMcpServers.length === 0 ? (
                <p className="text-sm text-text-tertiary">No MCP servers available.</p>
              ) : (
                <div className="space-y-2">
                  {availableMcpServers.map((server) => (
                    <div
                      key={server.name}
                      onClick={() => toggleMcpServer(server.name)}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                        enabledMcpServers.includes(server.name)
                          ? 'bg-accent/10 border border-accent/30'
                          : 'bg-black/20 border border-white/10 hover:bg-white/5'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={enabledMcpServers.includes(server.name)}
                        onChange={() => toggleMcpServer(server.name)}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-accent"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-text-primary">{server.name}</span>
                          {server.source === 'bundled' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-text-tertiary border border-white/10">bundled</span>
                          )}
                        </div>
                        {server.description && <p className="text-xs text-text-tertiary truncate mt-0.5">{server.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
