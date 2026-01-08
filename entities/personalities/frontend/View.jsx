import { useState, useEffect, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus } from '@fortawesome/free-solid-svg-icons'
import PersonalityCard from './PersonalityCard'
import TraitCard from './TraitCard'
import ProjectCard from './ProjectCard'
import McpServerCard from './McpServerCard'
import PersonalityEditor from './PersonalityEditor'
import TraitEditor from './TraitEditor'
import ProjectEditor from './ProjectEditor'
import McpServerEditor from './McpServerEditor'
import { useWebSocket } from '@/hooks/useWebSocket'
import { WS_URL } from '@/config'

export default function PersonalitiesView() {
  const { send } = useWebSocket(WS_URL)
  const [personalities, setPersonalities] = useState([])
  const [traits, setTraits] = useState([])
  const [mcpServers, setMcpServers] = useState([])
  const [projects, setProjects] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  // Navigation state
  const [view, setView] = useState('list')  // 'list' | 'personality' | 'trait' | 'mcp-server' | 'project'
  const [selectedPersonality, setSelectedPersonality] = useState(null)
  const [selectedTrait, setSelectedTrait] = useState(null)
  const [selectedMcpServer, setSelectedMcpServer] = useState(null)
  const [selectedProject, setSelectedProject] = useState(null)
  const [navigationStack, setNavigationStack] = useState([])

  // Navigation helpers
  const navigateTo = useCallback((newView, data) => {
    // Push current state to stack
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
    if (newView === 'trait') {
      setSelectedTrait(data)
    }
    if (newView === 'mcp-server') {
      setSelectedMcpServer(data)
    }
    if (newView === 'project') {
      setSelectedProject(data)
    }
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

  // Fetch personalities, traits, MCP servers, and projects on mount
  useEffect(() => {
    send({ event: 'personalities:list' })
    send({ event: 'traits:list' })
    send({ event: 'mcp-servers:list' })
    send({ event: 'projects:list' })
  }, [send])

  // Handle WebSocket responses via window.__irisWs
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

        if (msg.event === 'personalities:error') {
          console.error('Personality error:', msg.error)
        }

        if (msg.event === 'traits:error') {
          console.error('Trait error:', msg.error)
        }

        if (msg.event === 'mcp-servers:error') {
          console.error('MCP server error:', msg.error)
        }

        if (msg.event === 'projects:error') {
          console.error('Project error:', msg.error)
        }
      } catch {}
    }

    const ws = window.__irisWs
    if (ws) {
      ws.addEventListener('message', handleMessage)
      return () => ws.removeEventListener('message', handleMessage)
    }
  }, [send])

  // Personality handlers
  const handleEditPersonality = useCallback((personality) => {
    navigateTo('personality', personality)
  }, [navigateTo])

  const handleDeletePersonality = useCallback((personality) => {
    if (confirm(`Delete personality "${personality.name}"?`)) {
      send({ event: 'personalities:delete', name: personality.name })
    }
  }, [send])

  const handleNewPersonality = useCallback(() => {
    navigateTo('personality', { name: '', source: 'user', type: 'traits', isNew: true })
  }, [navigateTo])

  // Trait handlers
  const handleEditTrait = useCallback((trait) => {
    navigateTo('trait', trait)
  }, [navigateTo])

  const handleDeleteTrait = useCallback((trait) => {
    if (confirm(`Delete trait "${trait.name}"?`)) {
      send({ event: 'traits:delete', name: trait.name })
    }
  }, [send])

  const handleNewTrait = useCallback(() => {
    navigateTo('trait', { name: '', source: 'user', isNew: true })
  }, [navigateTo])

  // MCP server handlers
  const handleEditMcpServer = useCallback((server) => {
    navigateTo('mcp-server', server)
  }, [navigateTo])

  const handleDeleteMcpServer = useCallback((server) => {
    if (confirm(`Delete MCP server "${server.name}"?`)) {
      send({ event: 'mcp-servers:delete', name: server.name })
    }
  }, [send])

  const handleNewMcpServer = useCallback(() => {
    navigateTo('mcp-server', { name: '', source: 'user', isNew: true })
  }, [navigateTo])

  // Project handlers
  const handleEditProject = useCallback((project) => {
    navigateTo('project', project)
  }, [navigateTo])

  const handleDeleteProject = useCallback((project) => {
    if (confirm(`Delete project "${project.name}"?`)) {
      send({ event: 'projects:delete', name: project.name })
    }
  }, [send])

  const handleNewProject = useCallback(async () => {
    const path = await window.iris?.selectFolder()
    if (path) {
      const name = path.split('/').pop()
      navigateTo('project', { name, path, description: '', isNew: true })
    }
  }, [navigateTo])

  const handleSetDefaultProject = useCallback((project) => {
    send({ event: 'projects:setDefault', name: project.name })
  }, [send])

  // Render personality editor view
  if (view === 'personality' && selectedPersonality) {
    return (
      <PersonalityEditor
        personality={selectedPersonality}
        onBack={goBack}
        onOpenTrait={handleEditTrait}
      />
    )
  }

  // Render trait editor view
  if (view === 'trait' && selectedTrait) {
    return (
      <TraitEditor
        trait={selectedTrait}
        onBack={goBack}
      />
    )
  }

  // Render MCP server editor view
  if (view === 'mcp-server' && selectedMcpServer) {
    return (
      <McpServerEditor
        server={selectedMcpServer}
        onBack={goBack}
      />
    )
  }

  // Render project editor view
  if (view === 'project' && selectedProject) {
    return (
      <ProjectEditor
        project={selectedProject}
        onBack={goBack}
      />
    )
  }

  // Section header component
  const SectionHeader = ({ title, count, onNew }) => (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider">
        {title} <span className="text-text-tertiary">({count})</span>
      </h2>
      <button
        onClick={onNew}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-white/5 text-text-secondary hover:bg-white/10 hover:text-text-primary border border-white/10 rounded-lg transition-colors"
      >
        <FontAwesomeIcon icon={faPlus} size="xs" />
        New
      </button>
    </div>
  )

  // Render list view
  return (
    <div className="h-full overflow-y-auto">
      {isLoading ? (
        <div className="flex items-center justify-center h-full text-text-tertiary">
          Loading...
        </div>
      ) : (
        <div className="space-y-8">
          {/* Traits Section */}
          <div>
            <SectionHeader title="Traits" count={traits.length} onNew={handleNewTrait} />
            {traits.length === 0 ? (
              <p className="text-sm text-text-tertiary">No traits yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {traits.map((trait, index) => (
                  <TraitCard
                    key={trait.name}
                    trait={trait}
                    onEdit={handleEditTrait}
                    onDelete={handleDeleteTrait}
                    staggerIndex={index}
                  />
                ))}
              </div>
            )}
          </div>

          {/* MCP Servers Section */}
          <div>
            <SectionHeader title="MCP Servers" count={mcpServers.length} onNew={handleNewMcpServer} />
            {mcpServers.length === 0 ? (
              <p className="text-sm text-text-tertiary">No MCP servers yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {mcpServers.map((server, index) => (
                  <McpServerCard
                    key={server.name}
                    server={server}
                    onEdit={handleEditMcpServer}
                    onDelete={handleDeleteMcpServer}
                    staggerIndex={index}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Personalities Section */}
          <div>
            <SectionHeader title="Personalities" count={personalities.length} onNew={handleNewPersonality} />
            {personalities.length === 0 ? (
              <p className="text-sm text-text-tertiary">No personalities yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {personalities.map((personality, index) => (
                  <PersonalityCard
                    key={personality.name}
                    personality={personality}
                    onEdit={handleEditPersonality}
                    onDelete={handleDeletePersonality}
                    staggerIndex={index}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Projects Section */}
          <div>
            <SectionHeader title="Projects" count={projects.length} onNew={handleNewProject} />
            {projects.length === 0 ? (
              <p className="text-sm text-text-tertiary">No projects yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {projects.map((project, index) => (
                  <ProjectCard
                    key={project.name}
                    project={project}
                    onEdit={handleEditProject}
                    onDelete={handleDeleteProject}
                    onSetDefault={handleSetDefaultProject}
                    staggerIndex={index}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
