import { useState, useEffect, useCallback } from 'react'
import { useStore } from '@/store'
import { THEMES } from '@/themes'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faEye,
  faEyeSlash,
  faCheck,
  faExternalLink,
  faPalette,
  faCalendar,
  faLink,
  faUnlink,
  faPlus
} from '@fortawesome/free-solid-svg-icons'
import { IconButton, ActionButton, Card } from '../../_ui'
import PersonalityCard from '../../personalities/frontend/PersonalityCard'
import TraitCard from '../../personalities/frontend/TraitCard'
import ProjectCard from '../../personalities/frontend/ProjectCard'
import McpServerCard from '../../personalities/frontend/McpServerCard'
import PersonalityEditor from '../../personalities/frontend/PersonalityEditor'
import TraitEditor from '../../personalities/frontend/TraitEditor'
import ProjectEditor from '../../personalities/frontend/ProjectEditor'
import McpServerEditor from '../../personalities/frontend/McpServerEditor'

function ThemePicker({ send }) {
  const theme = useStore(s => s.theme)

  const handleSelect = (themeId) => {
    send({ event: 'theme:set', theme: themeId })
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {THEMES.map((t) => (
        <button
          key={t.id}
          onClick={() => handleSelect(t.id)}
          className={`px-3 py-2 text-left text-sm flex items-center gap-2 rounded-lg border transition-all ${
            t.id === theme
              ? 'bg-accent/20 border-accent/50 text-text-primary'
              : 'bg-black/20 border-white/10 text-text-secondary hover:bg-black/30 hover:border-white/20'
          }`}
        >
          <span
            className="w-3 h-3 rounded-full border border-white/20 flex-shrink-0"
            style={{ backgroundColor: t.accent }}
          />
          <span className="truncate">{t.label}</span>
          {t.id === theme && (
            <FontAwesomeIcon icon={faCheck} className="ml-auto text-accent text-xs" />
          )}
        </button>
      ))}
    </div>
  )
}

function SettingCard({ title, description, children }) {
  return (
    <Card className="border-l-2 border-l-[#C0C0C0]">
      <h3 className="text-sm font-medium text-text-primary mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-text-tertiary mb-3">{description}</p>
      )}
      {children}
    </Card>
  )
}

function TextInput({ label, value, onSave, placeholder, helpText, multiline = false }) {
  const [inputValue, setInputValue] = useState(value || '')
  const [saved, setSaved] = useState(false)
  const hasChanged = inputValue !== (value || '')

  useEffect(() => {
    setInputValue(value || '')
  }, [value])

  const handleSave = () => {
    if (hasChanged) {
      onSave(inputValue)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !multiline) {
      handleSave()
    }
  }

  const inputClass = `w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent/50 ${multiline ? 'min-h-[100px] resize-y' : ''}`

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-text-secondary">{label}</label>
      <div className="flex gap-2">
        <div className="flex-1">
          {multiline ? (
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={placeholder}
              className={inputClass}
            />
          ) : (
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className={inputClass}
            />
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={!hasChanged}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors self-start ${
            saved
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : hasChanged
                ? 'bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30'
                : 'bg-black/30 text-text-tertiary border border-white/10 cursor-not-allowed'
          }`}
        >
          {saved ? (
            <>
              <FontAwesomeIcon icon={faCheck} className="mr-1" />
              Saved
            </>
          ) : (
            'Save'
          )}
        </button>
      </div>
      {helpText && (
        <p className="text-xs text-text-tertiary">{helpText}</p>
      )}
    </div>
  )
}

function GoogleCalendarConnect({ send, settings }) {
  const [connecting, setConnecting] = useState(false)
  const calendarSettings = settings?.googleCalendar || {}
  const isConnected = calendarSettings.connected
  const hasCredentials = settings?.hasGoogleClientId && settings?.hasGoogleClientSecret

  useEffect(() => {
    // Listen for auth URL response
    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.event === 'calendar:auth:url') {
          // Open OAuth URL in external browser
          window.open(data.url, '_blank')
          setConnecting(false)
        } else if (data.event === 'calendar:error') {
          console.error('Calendar error:', data.error)
          setConnecting(false)
        }
      } catch (e) {}
    }

    if (window.__irisWs) {
      window.__irisWs.addEventListener('message', handleMessage)
      return () => window.__irisWs.removeEventListener('message', handleMessage)
    }
  }, [])

  const handleConnect = () => {
    setConnecting(true)
    send({ event: 'calendar:auth:start' })
  }

  const handleDisconnect = () => {
    send({ event: 'calendar:disconnect' })
  }

  const handleSaveClientId = (value) => {
    send({ event: 'settings:update', key: 'googleClientId', value })
  }

  const handleSaveClientSecret = (value) => {
    send({ event: 'settings:update', key: 'googleClientSecret', value })
  }

  return (
    <div className="flex flex-col gap-4">
      <ApiKeyInput
        label="Client ID"
        maskedValue={settings?.googleClientId}
        hasValue={settings?.hasGoogleClientId}
        onSave={handleSaveClientId}
        helpUrl="https://console.cloud.google.com/apis/credentials"
        helpText="Get OAuth credentials from Google Cloud Console"
      />
      <ApiKeyInput
        label="Client Secret"
        maskedValue={settings?.googleClientSecret}
        hasValue={settings?.hasGoogleClientSecret}
        onSave={handleSaveClientSecret}
      />

      <div className="pt-2 border-t border-white/10">
        {isConnected ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              <span className="text-sm text-text-primary">
                Connected as <strong>{calendarSettings.email}</strong>
              </span>
            </div>
            <button
              onClick={handleDisconnect}
              className="px-3 py-1.5 rounded-lg text-sm bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors flex items-center gap-2"
            >
              <FontAwesomeIcon icon={faUnlink} />
              Disconnect
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-tertiary">
              {hasCredentials ? 'Ready to connect' : 'Enter credentials above first'}
            </span>
            <button
              onClick={handleConnect}
              disabled={connecting || !hasCredentials}
              className="px-3 py-1.5 rounded-lg text-sm bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FontAwesomeIcon icon={faLink} />
              {connecting ? 'Opening...' : 'Connect'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Toggle({ label, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex flex-col flex-1 mr-4">
        <span className="text-sm text-text-primary">{label}</span>
        {description && (
          <span className="text-xs text-text-tertiary">{description}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-green-400">{checked ? 'ON' : 'OFF'}</span>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          style={{ width: 20, height: 20 }}
        />
      </div>
    </div>
  )
}

const MCP_TOOLS_DEFAULT = { code: true, terminal: true, gods: true, ui: true, browse: true, speak: true }

function McpToolsToggles({ settings, send }) {
  const mcpTools = { ...MCP_TOOLS_DEFAULT, ...settings.mcpTools }

  const update = (key, value) => {
    send({ event: 'settings:update', key: 'mcpTools', value: { ...mcpTools, [key]: value } })
  }

  return (
    <div className="flex flex-col divide-y divide-white/10">
      <Toggle
        label="Code"
        description="iris_read, iris_edit, open_code, highlight_code, clear_highlights"
        checked={mcpTools.code}
        onChange={(v) => update('code', v)}
      />
      <Toggle
        label="Terminal"
        description="run_terminal, peek_run, peek_terminal, push_to_terminal"
        checked={mcpTools.terminal}
        onChange={(v) => update('terminal', v)}
      />
      <Toggle
        label="Gods"
        description="spawn_god, peek_god, push_to_god"
        checked={mcpTools.gods}
        onChange={(v) => update('gods', v)}
      />
      <Toggle
        label="UI"
        description="set_title, set_ready, list_entities"
        checked={mcpTools.ui}
        onChange={(v) => update('ui', v)}
      />
      <Toggle
        label="Browse"
        description="browse, open_markdown"
        checked={mcpTools.browse}
        onChange={(v) => update('browse', v)}
      />
      <Toggle
        label="Speak"
        description="speak, greet"
        checked={mcpTools.speak}
        onChange={(v) => update('speak', v)}
      />
    </div>
  )
}

function SectionHeader({ title, count, onNew }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
        {title} {count !== undefined && <span className="text-text-tertiary/50">({count})</span>}
      </h3>
      {onNew && (
        <ActionButton variant="ghost" icon={faPlus} onClick={onNew} compact>
          New
        </ActionButton>
      )}
    </div>
  )
}

function PersonalitiesSection({ send }) {
  const [personalities, setPersonalities] = useState([])
  const [traits, setTraits] = useState([])
  const [mcpServers, setMcpServers] = useState([])
  const [projects, setProjects] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  const [view, setView] = useState('list')
  const [selectedPersonality, setSelectedPersonality] = useState(null)
  const [selectedTrait, setSelectedTrait] = useState(null)
  const [selectedMcpServer, setSelectedMcpServer] = useState(null)
  const [selectedProject, setSelectedProject] = useState(null)
  const [navigationStack, setNavigationStack] = useState([])

  const navigateTo = useCallback((newView, data) => {
    setNavigationStack(prev => [...prev, {
      view,
      personality: selectedPersonality,
      trait: selectedTrait,
      mcpServer: selectedMcpServer,
      project: selectedProject
    }])

    setView(newView)
    if (newView === 'personality') {
      setSelectedPersonality(data)
      setSelectedTrait(null)
      setSelectedMcpServer(null)
      setSelectedProject(null)
    }
    if (newView === 'trait') setSelectedTrait(data)
    if (newView === 'mcp-server') setSelectedMcpServer(data)
    if (newView === 'project') setSelectedProject(data)
  }, [view, selectedPersonality, selectedTrait, selectedMcpServer, selectedProject])

  const goBack = useCallback(() => {
    const prev = navigationStack[navigationStack.length - 1]
    if (prev) {
      setView(prev.view)
      setSelectedPersonality(prev.personality)
      setSelectedTrait(prev.trait)
      setSelectedMcpServer(prev.mcpServer)
      setSelectedProject(prev.project)
      setNavigationStack(stack => stack.slice(0, -1))
    }
  }, [navigationStack])

  useEffect(() => {
    send({ event: 'personalities:list' })
    send({ event: 'traits:list' })
    send({ event: 'mcp-servers:list' })
    send({ event: 'projects:list' })
  }, [send])

  useEffect(() => {
    const handleMessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        if (msg.event === 'personalities:list:response') {
          setPersonalities(msg.personalities || [])
          setIsLoading(false)
        }
        if (msg.event === 'traits:list:response') {
          setTraits(msg.traits || [])
        }
        if (msg.event === 'personalities:save:response' || msg.event === 'personalities:delete:response') {
          send({ event: 'personalities:list' })
        }
        if (msg.event === 'traits:save:response' || msg.event === 'traits:delete:response') {
          send({ event: 'traits:list' })
        }
        if (msg.event === 'mcp-servers:list:response') {
          setMcpServers(msg.servers || [])
        }
        if (msg.event === 'mcp-servers:save:response' || msg.event === 'mcp-servers:delete:response') {
          send({ event: 'mcp-servers:list' })
        }
        if (msg.event === 'projects:list:response') {
          setProjects(msg.projects || [])
        }
        if (msg.event === 'projects:save:response' || msg.event === 'projects:delete:response' || msg.event === 'projects:setDefault:response') {
          send({ event: 'projects:list' })
        }
      } catch {}
    }

    const ws = window.__irisWs
    if (ws) {
      ws.addEventListener('message', handleMessage)
      return () => ws.removeEventListener('message', handleMessage)
    }
  }, [send])

  const handleEditPersonality = useCallback((p) => navigateTo('personality', p), [navigateTo])
  const handleDeletePersonality = useCallback((p) => {
    if (confirm(`Delete personality "${p.name}"?`)) {
      send({ event: 'personalities:delete', name: p.name })
    }
  }, [send])
  const handleNewPersonality = useCallback(() => {
    navigateTo('personality', { name: '', source: 'user', type: 'traits', isNew: true })
  }, [navigateTo])

  const handleEditTrait = useCallback((t) => navigateTo('trait', t), [navigateTo])
  const handleDeleteTrait = useCallback((t) => {
    if (confirm(`Delete trait "${t.name}"?`)) {
      send({ event: 'traits:delete', name: t.name })
    }
  }, [send])
  const handleNewTrait = useCallback(() => {
    navigateTo('trait', { name: '', source: 'user', isNew: true })
  }, [navigateTo])

  const handleEditMcpServer = useCallback((s) => navigateTo('mcp-server', s), [navigateTo])
  const handleDeleteMcpServer = useCallback((s) => {
    if (confirm(`Delete MCP server "${s.name}"?`)) {
      send({ event: 'mcp-servers:delete', name: s.name })
    }
  }, [send])
  const handleNewMcpServer = useCallback(() => {
    navigateTo('mcp-server', { name: '', source: 'user', isNew: true })
  }, [navigateTo])

  const handleEditProject = useCallback((p) => navigateTo('project', p), [navigateTo])
  const handleDeleteProject = useCallback((p) => {
    if (confirm(`Delete project "${p.name}"?`)) {
      send({ event: 'projects:delete', name: p.name })
    }
  }, [send])
  const handleNewProject = useCallback(async () => {
    const path = await window.iris?.selectFolder()
    if (path) {
      const name = path.split('/').pop()
      navigateTo('project', { name, path, description: '', isNew: true })
    }
  }, [navigateTo])
  const handleSetDefaultProject = useCallback((p) => {
    send({ event: 'projects:setDefault', name: p.name })
  }, [send])

  // Editor views
  if (view === 'personality' && selectedPersonality) {
    return <PersonalityEditor personality={selectedPersonality} onBack={goBack} onOpenTrait={handleEditTrait} />
  }
  if (view === 'trait' && selectedTrait) {
    return <TraitEditor trait={selectedTrait} onBack={goBack} />
  }
  if (view === 'mcp-server' && selectedMcpServer) {
    return <McpServerEditor server={selectedMcpServer} onBack={goBack} />
  }
  if (view === 'project' && selectedProject) {
    return <ProjectEditor project={selectedProject} onBack={goBack} />
  }

  if (isLoading) {
    return <div className="text-text-tertiary text-sm">Loading...</div>
  }

  return (
    <div className="space-y-6">
      {/* Traits */}
      <div>
        <SectionHeader title="Traits" count={traits.length} onNew={handleNewTrait} />
        {traits.length === 0 ? (
          <p className="text-sm text-text-tertiary">No traits yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {traits.map((trait) => (
              <TraitCard key={trait.name} trait={trait} onEdit={handleEditTrait} onDelete={handleDeleteTrait} />
            ))}
          </div>
        )}
      </div>

      {/* MCP Servers */}
      <div>
        <SectionHeader title="MCP Servers" count={mcpServers.length} onNew={handleNewMcpServer} />
        {mcpServers.length === 0 ? (
          <p className="text-sm text-text-tertiary">No MCP servers yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {mcpServers.map((server) => (
              <McpServerCard key={server.name} server={server} onEdit={handleEditMcpServer} onDelete={handleDeleteMcpServer} />
            ))}
          </div>
        )}
      </div>

      {/* Personalities */}
      <div>
        <SectionHeader title="Personalities" count={personalities.length} onNew={handleNewPersonality} />
        {personalities.length === 0 ? (
          <p className="text-sm text-text-tertiary">No personalities yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {personalities.map((personality) => (
              <PersonalityCard key={personality.name} personality={personality} onEdit={handleEditPersonality} onDelete={handleDeletePersonality} />
            ))}
          </div>
        )}
      </div>

      {/* Projects */}
      <div>
        <SectionHeader title="Projects" count={projects.length} onNew={handleNewProject} />
        {projects.length === 0 ? (
          <p className="text-sm text-text-tertiary">No projects yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {projects.map((project) => (
              <ProjectCard key={project.name} project={project} onEdit={handleEditProject} onDelete={handleDeleteProject} onSetDefault={handleSetDefaultProject} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ApiKeyInput({ label, value, maskedValue, hasValue, onSave, helpUrl, helpText }) {
  const [inputValue, setInputValue] = useState('')
  const [showValue, setShowValue] = useState(false)
  const [saved, setSaved] = useState(false)

  // Show masked value when not editing
  const displayValue = inputValue || (showValue ? '' : maskedValue)

  const handleSave = () => {
    if (inputValue) {
      onSave(inputValue)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      setInputValue('')
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSave()
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-text-secondary">{label}</label>
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type={showValue ? 'text' : 'password'}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={hasValue ? maskedValue : 'Enter API key...'}
            className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent/50"
          />
        </div>
        <IconButton
          icon={showValue ? faEyeSlash : faEye}
          onClick={() => setShowValue(!showValue)}
          title={showValue ? 'Hide' : 'Show'}
        />
        <button
          onClick={handleSave}
          disabled={!inputValue}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            saved
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : inputValue
                ? 'bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30'
                : 'bg-black/30 text-text-tertiary border border-white/10 cursor-not-allowed'
          }`}
        >
          {saved ? (
            <>
              <FontAwesomeIcon icon={faCheck} className="mr-1" />
              Saved
            </>
          ) : (
            'Save'
          )}
        </button>
      </div>
      {helpUrl && (
        <button
          onClick={() => window.iris?.openExternal(helpUrl)}
          className="text-xs text-accent hover:underline flex items-center gap-1 text-left"
        >
          {helpText || 'Get your API key'}
          <FontAwesomeIcon icon={faExternalLink} className="text-[10px]" />
        </button>
      )}
    </div>
  )
}

export default function SettingsView({ send }) {
  const settings = useStore(s => s.settings) || {}

  const handleSaveLinearKey = (value) => {
    send({ event: 'settings:update', key: 'linearApiKey', value })
  }

  const handleSaveUserName = (value) => {
    send({ event: 'settings:update', key: 'userName', value })
  }

  const handleSaveStartPrompt = (value) => {
    send({ event: 'settings:update', key: 'startPrompt', value })
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-medium text-text-primary">Settings</h1>
          <p className="text-sm text-text-tertiary">Configure Iris integrations and preferences</p>
        </div>

        {/* Gods section */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-3">
            Gods
          </h2>
          <div className="flex flex-col gap-4">
            <SettingCard
              title="Your Name"
              description="How gods will address you"
            >
              <TextInput
                label="Name"
                value={settings.userName}
                onSave={handleSaveUserName}
                placeholder="Paul"
                helpText="Gods will use this name when speaking to you"
              />
            </SettingCard>

            <SettingCard
              title="Start Prompt"
              description="Additional instructions prepended when spawning gods"
            >
              <TextInput
                label="Custom instructions"
                value={settings.startPrompt}
                onSave={handleSaveStartPrompt}
                placeholder="Be concise. Always verify before making changes..."
                helpText="This text is added to every god's initial prompt"
                multiline
              />
            </SettingCard>
          </div>
        </div>

        {/* Appearance section */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-3">
            Appearance
          </h2>
          <div className="flex flex-col gap-4">
            <SettingCard
              title="Theme"
              description="Choose a color theme for the interface"
            >
              <ThemePicker send={send} />
            </SettingCard>
          </div>
        </div>

        {/* Integrations section */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-3">
            Integrations
          </h2>
          <div className="flex flex-col gap-4">
            <SettingCard
              title="Linear"
              description="Connect to Linear to view and manage your issues"
            >
              <ApiKeyInput
                label="API Key"
                maskedValue={settings.linearApiKey}
                hasValue={settings.hasLinearApiKey}
                onSave={handleSaveLinearKey}
                helpUrl="https://linear.app/settings/api"
                helpText="Get your Linear API key"
              />
            </SettingCard>

            <SettingCard
              title="Google Calendar"
              description="Connect to Google Calendar to view and create events"
            >
              <GoogleCalendarConnect send={send} settings={settings} />
            </SettingCard>
          </div>
        </div>

        {/* MCP Tools section */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-3">
            MCP Tools
          </h2>
          <div className="flex flex-col gap-4">
            <SettingCard
              title="Tool Categories"
              description="Toggle tool categories for Claude Code. Restart Claude Code session after changing."
            >
              <McpToolsToggles settings={settings} send={send} />
            </SettingCard>
          </div>
        </div>

        {/* Personalities section */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-3">
            Personalities
          </h2>
          <PersonalitiesSection send={send} />
        </div>
      </div>
    </div>
  )
}
