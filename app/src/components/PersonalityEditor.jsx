import { useState, useEffect, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSave, faDna, faPuzzlePiece, faArrowLeft, faPenToSquare, faPlug } from '@fortawesome/free-solid-svg-icons'
import { useWebSocket } from '../hooks/useWebSocket'
import { WS_URL } from '../config'

export default function PersonalityEditor({
  entity,           // Standalone mode (from entity spawn)
  personality: personalityProp,  // Embedded mode (direct data from parent)
  onBack,           // Back navigation callback (embedded mode)
  onOpenTrait       // Navigate to trait editor (embedded mode)
}) {
  const { send } = useWebSocket(WS_URL)

  // Determine data source - embedded mode takes priority
  const personality = personalityProp || entity?.data?.personality || {}
  const isNew = personality.isNew || false
  const isBundled = personality.source === 'bundled'

  const [personalityName, setPersonalityName] = useState(personality.name || '')
  const [description, setDescription] = useState(personality.description || '')

  // Trait management
  const [availableTraits, setAvailableTraits] = useState([])
  const [enabledTraits, setEnabledTraits] = useState(personality.traits || [])
  const [originalEnabledTraits, setOriginalEnabledTraits] = useState([])

  // MCP server management
  const [availableMcpServers, setAvailableMcpServers] = useState([])
  const [enabledMcpServers, setEnabledMcpServers] = useState(personality.mcpServers || [])
  const [originalEnabledMcpServers, setOriginalEnabledMcpServers] = useState([])

  const [isLoading, setIsLoading] = useState(!isNew)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [saveMessage, setSaveMessage] = useState(null)

  // Load personality content, traits, and MCP servers on mount
  useEffect(() => {
    // Fetch available traits and MCP servers
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

  // Handle WebSocket responses
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

  // Track changes
  useEffect(() => {
    const traitsChanged = JSON.stringify([...enabledTraits].sort()) !== JSON.stringify([...originalEnabledTraits].sort())
    const mcpServersChanged = JSON.stringify([...enabledMcpServers].sort()) !== JSON.stringify([...originalEnabledMcpServers].sort())
    setHasChanges(traitsChanged || mcpServersChanged || (isNew && personalityName))
  }, [enabledTraits, originalEnabledTraits, enabledMcpServers, originalEnabledMcpServers, isNew, personalityName])

  const handleSave = useCallback(() => {
    const name = isNew ? personalityName : personality.name
    if (!name.trim()) {
      setSaveMessage('Personality name required')
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
    setEnabledTraits(prev => {
      if (prev.includes(traitName)) {
        return prev.filter(t => t !== traitName)
      } else {
        return [...prev, traitName]
      }
    })
  }, [])

  const toggleMcpServer = useCallback((serverName) => {
    setEnabledMcpServers(prev => {
      if (prev.includes(serverName)) {
        return prev.filter(s => s !== serverName)
      } else {
        return [...prev, serverName]
      }
    })
  }, [])

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

        <FontAwesomeIcon icon={faDna} className="text-purple-400" />

        <span className="flex-1 text-white text-sm font-medium">
          {isNew ? 'New Personality' : personality.name}
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
          {/* Name and Description */}
          <div className="space-y-4">
            {isNew && (
              <div>
                <label className="block text-xs text-white/60 mb-1">Personality Name</label>
                <input
                  type="text"
                  value={personalityName}
                  onChange={(e) => setPersonalityName(e.target.value)}
                  placeholder="my-custom-personality"
                  className="w-full bg-white/5 text-white text-sm rounded px-3 py-2 outline-none border border-white/10 focus:border-purple-400"
                />
              </div>
            )}
            <div>
              <label className="block text-xs text-white/60 mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description of this personality..."
                className="w-full bg-white/5 text-white text-sm rounded px-3 py-2 outline-none border border-white/10 focus:border-purple-400"
              />
            </div>
          </div>

          {/* Traits checkboxes */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <FontAwesomeIcon icon={faPuzzlePiece} className="text-purple-400" size="sm" />
              <span className="text-sm font-medium text-white">Enabled Traits</span>
              <span className="text-xs text-white/40">({enabledTraits.length} selected)</span>
            </div>

            {availableTraits.length === 0 ? (
              <div className="text-xs text-white/40 py-4">
                No traits available. Create some traits first.
              </div>
            ) : (
              <div className="space-y-2">
                {availableTraits.map((trait) => (
                  <div
                    key={trait.name}
                    className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                      enabledTraits.includes(trait.name)
                        ? 'bg-purple-500/20 border border-purple-500/40'
                        : 'bg-white/5 border border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <label className="flex items-start gap-3 flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enabledTraits.includes(trait.name)}
                        onChange={() => toggleTrait(trait.name)}
                        className="mt-0.5 accent-purple-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white">{trait.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            trait.source === 'bundled'
                              ? 'bg-blue-500/20 text-blue-300'
                              : 'bg-green-500/20 text-green-300'
                          }`}>
                            {trait.source}
                          </span>
                        </div>
                        {trait.preview && (
                          <div className="text-xs text-white/40 mt-1 line-clamp-1 font-mono">
                            {trait.preview}
                          </div>
                        )}
                      </div>
                    </label>
                    {/* Edit trait button (embedded mode) */}
                    {onOpenTrait && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenTrait(trait)
                        }}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-white/50 hover:text-purple-300 hover:bg-purple-500/20 rounded transition-colors"
                        title="Edit trait"
                      >
                        <FontAwesomeIcon icon={faPenToSquare} size="xs" />
                        Edit
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* MCP Servers checkboxes */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <FontAwesomeIcon icon={faPlug} className="text-cyan-400" size="sm" />
              <span className="text-sm font-medium text-white">MCP Servers</span>
              <span className="text-xs text-white/40">({enabledMcpServers.length} selected)</span>
            </div>

            {availableMcpServers.length === 0 ? (
              <div className="text-xs text-white/40 py-4">
                No MCP servers available.
              </div>
            ) : (
              <div className="space-y-2">
                {availableMcpServers.map((server) => (
                  <div
                    key={server.name}
                    className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                      enabledMcpServers.includes(server.name)
                        ? 'bg-cyan-500/20 border border-cyan-500/40'
                        : 'bg-white/5 border border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <label className="flex items-start gap-3 flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enabledMcpServers.includes(server.name)}
                        onChange={() => toggleMcpServer(server.name)}
                        className="mt-0.5 accent-cyan-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white">{server.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            server.source === 'bundled'
                              ? 'bg-blue-500/20 text-blue-300'
                              : 'bg-green-500/20 text-green-300'
                          }`}>
                            {server.source}
                          </span>
                        </div>
                        {server.description && (
                          <div className="text-xs text-white/40 mt-1 line-clamp-1">
                            {server.description}
                          </div>
                        )}
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Preview hint */}
          {(enabledTraits.length > 0 || enabledMcpServers.length > 0) && (
            <div className="text-xs text-white/40 pt-4 border-t border-white/10 space-y-1">
              {enabledTraits.length > 0 && (
                <div>Traits: {enabledTraits.join(', ')}</div>
              )}
              {enabledMcpServers.length > 0 && (
                <div>MCP Servers: {enabledMcpServers.join(', ')}</div>
              )}
            </div>
          )}
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
