import { useState, useEffect, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSave, faArrowLeft, faPenToSquare } from '@fortawesome/free-solid-svg-icons'
import { useWebSocket } from '@/hooks/useWebSocket'
import { WS_URL } from '@/config'

export default function PersonalityEditor({
  entity,
  personality: personalityProp,
  onBack,
  onOpenTrait
}) {
  const { send } = useWebSocket(WS_URL)

  const personality = personalityProp || entity?.data?.personality || {}
  const isNew = personality.isNew || false
  const isBundled = personality.source === 'bundled'

  const [personalityName, setPersonalityName] = useState(personality.name || '')
  const [description, setDescription] = useState(personality.description || '')

  const [availableTraits, setAvailableTraits] = useState([])
  const [enabledTraits, setEnabledTraits] = useState(personality.traits || [])
  const [originalEnabledTraits, setOriginalEnabledTraits] = useState([])

  const [availableMcpServers, setAvailableMcpServers] = useState([])
  const [enabledMcpServers, setEnabledMcpServers] = useState(personality.mcpServers || [])
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

    if (personality.name) {
      send({ event: 'personalities:get', name: personality.name })
    }
  }, [personality.name, isNew, send])

  useEffect(() => {
    const handleMessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        if (msg.event === 'traits:list:response') {
          setAvailableTraits(msg.traits || [])
        }

        if (msg.event === 'mcp-servers:list:response') {
          setAvailableMcpServers(msg.servers || [])
        }

        if (msg.event === 'personalities:get:response' && msg.name === personality.name) {
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
  }, [personality.name, enabledTraits])

  useEffect(() => {
    const traitsChanged = JSON.stringify([...enabledTraits].sort()) !== JSON.stringify([...originalEnabledTraits].sort())
    const mcpServersChanged = JSON.stringify([...enabledMcpServers].sort()) !== JSON.stringify([...originalEnabledMcpServers].sort())
    setHasChanges(traitsChanged || mcpServersChanged || (isNew && personalityName))
  }, [enabledTraits, originalEnabledTraits, enabledMcpServers, originalEnabledMcpServers, isNew, personalityName])

  const handleSave = useCallback(() => {
    const name = isNew ? personalityName : personality.name
    if (!name.trim()) {
      setSaveMessage('Name required')
      setTimeout(() => setSaveMessage(null), 2000)
      return
    }

    setIsSaving(true)
    send({
      event: 'personalities:save',
      name: name.trim(),
      type: 'traits',
      config: {
        name: name.trim(),
        description: description.trim(),
        traits: enabledTraits,
        mcpServers: enabledMcpServers
      }
    })
  }, [send, isNew, personalityName, personality.name, enabledTraits, enabledMcpServers, description])

  const toggleTrait = useCallback((traitName) => {
    setEnabledTraits(prev => prev.includes(traitName) ? prev.filter(t => t !== traitName) : [...prev, traitName])
  }, [])

  const toggleMcpServer = useCallback((serverName) => {
    setEnabledMcpServers(prev => prev.includes(serverName) ? prev.filter(s => s !== serverName) : [...prev, serverName])
  }, [])

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
            {isNew ? 'New Personality' : personality.name}
          </h1>
          <p className="text-sm text-text-tertiary">
            {isBundled ? 'Bundled' : 'User'} personality
          </p>
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
        <div className="space-y-8">
          {/* Name & Description */}
          <div className="space-y-4">
            {isNew && (
              <div>
                <label className="block text-xs text-text-tertiary mb-1">Name</label>
                <input
                  type="text"
                  value={personalityName}
                  onChange={(e) => setPersonalityName(e.target.value)}
                  placeholder="my-personality"
                  className="w-full bg-black/20 text-text-primary text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-accent/50 focus:outline-none"
                />
              </div>
            )}
            <div>
              <label className="block text-xs text-text-tertiary mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description..."
                className="w-full bg-black/20 text-text-primary text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-accent/50 focus:outline-none"
              />
            </div>
          </div>

          {/* Traits */}
          <div>
            <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-3">
              Traits <span className="text-text-tertiary">({enabledTraits.length} selected)</span>
            </h2>
            {availableTraits.length === 0 ? (
              <p className="text-sm text-text-tertiary">No traits available.</p>
            ) : (
              <div className="space-y-2">
                {availableTraits.map((trait) => (
                  <div
                    key={trait.name}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      enabledTraits.includes(trait.name)
                        ? 'bg-accent/10 border border-accent/30'
                        : 'bg-black/20 border border-white/10 hover:bg-white/5'
                    }`}
                    onClick={() => toggleTrait(trait.name)}
                  >
                    <input
                      type="checkbox"
                      checked={enabledTraits.includes(trait.name)}
                      onChange={() => toggleTrait(trait.name)}
                      className="accent-accent"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-text-primary">{trait.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-text-tertiary border border-white/10">
                          {trait.source}
                        </span>
                      </div>
                      {trait.preview && (
                        <div className="text-xs text-text-tertiary mt-0.5 truncate font-mono">{trait.preview}</div>
                      )}
                    </div>
                    {onOpenTrait && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onOpenTrait(trait) }}
                        className="text-xs text-text-tertiary hover:text-text-primary px-2 py-1 hover:bg-white/10 rounded transition-colors"
                      >
                        <FontAwesomeIcon icon={faPenToSquare} size="xs" /> Edit
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* MCP Servers */}
          <div>
            <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-3">
              MCP Servers <span className="text-text-tertiary">({enabledMcpServers.length} selected)</span>
            </h2>
            {availableMcpServers.length === 0 ? (
              <p className="text-sm text-text-tertiary">No MCP servers available.</p>
            ) : (
              <div className="space-y-2">
                {availableMcpServers.map((server) => (
                  <div
                    key={server.name}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      enabledMcpServers.includes(server.name)
                        ? 'bg-accent/10 border border-accent/30'
                        : 'bg-black/20 border border-white/10 hover:bg-white/5'
                    }`}
                    onClick={() => toggleMcpServer(server.name)}
                  >
                    <input
                      type="checkbox"
                      checked={enabledMcpServers.includes(server.name)}
                      onChange={() => toggleMcpServer(server.name)}
                      className="accent-accent"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-text-primary">{server.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-text-tertiary border border-white/10">
                          {server.source}
                        </span>
                      </div>
                      {server.description && (
                        <div className="text-xs text-text-tertiary mt-0.5 truncate">{server.description}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
