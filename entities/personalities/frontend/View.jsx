import { useState, useEffect, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus } from '@fortawesome/free-solid-svg-icons'
import { ActionButton } from '../../_ui'
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

function SectionHeader({ title, count, onNew }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider">
        {title} <span className="text-text-tertiary font-normal">({count})</span>
      </h2>
      <ActionButton variant="ghost" icon={faPlus} onClick={onNew} compact>
        New
      </ActionButton>
    </div>
  )
}

export default function PersonalitiesView() {
  const { send } = useWebSocket(WS_URL)
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

  // List view
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-8 pt-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-text-tertiary">
            Loading...
          </div>
        ) : (
          <>
            {/* Traits */}
            <section>
              <SectionHeader title="Traits" count={traits.length} onNew={handleNewTrait} />
              {traits.length === 0 ? (
                <p className="text-sm text-text-tertiary">No traits yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {traits.map((trait) => (
                    <TraitCard key={trait.name} trait={trait} onEdit={handleEditTrait} onDelete={handleDeleteTrait} />
                  ))}
                </div>
              )}
            </section>

            {/* MCP Servers */}
            <section>
              <SectionHeader title="MCP Servers" count={mcpServers.length} onNew={handleNewMcpServer} />
              {mcpServers.length === 0 ? (
                <p className="text-sm text-text-tertiary">No MCP servers yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {mcpServers.map((server) => (
                    <McpServerCard key={server.name} server={server} onEdit={handleEditMcpServer} onDelete={handleDeleteMcpServer} />
                  ))}
                </div>
              )}
            </section>

            {/* Personalities */}
            <section>
              <SectionHeader title="Personalities" count={personalities.length} onNew={handleNewPersonality} />
              {personalities.length === 0 ? (
                <p className="text-sm text-text-tertiary">No personalities yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {personalities.map((personality) => (
                    <PersonalityCard key={personality.name} personality={personality} onEdit={handleEditPersonality} onDelete={handleDeletePersonality} />
                  ))}
                </div>
              )}
            </section>

            {/* Projects */}
            <section>
              <SectionHeader title="Projects" count={projects.length} onNew={handleNewProject} />
              {projects.length === 0 ? (
                <p className="text-sm text-text-tertiary">No projects yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {projects.map((project) => (
                    <ProjectCard key={project.name} project={project} onEdit={handleEditProject} onDelete={handleDeleteProject} onSetDefault={handleSetDefaultProject} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
