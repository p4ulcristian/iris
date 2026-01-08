import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faPuzzlePiece, faDna, faFolder, faPlug } from '@fortawesome/free-solid-svg-icons'
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

  // Render list view
  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/20">
        <h2 className="text-white text-sm font-medium">Personalities & Traits</h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-white/40">
            Loading...
          </div>
        ) : (
          <>
            {/* Traits Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-white/70">
                  <FontAwesomeIcon icon={faPuzzlePiece} size="sm" className="text-purple-400" />
                  <span className="text-xs font-medium uppercase tracking-wide">Traits</span>
                  <span className="text-xs text-white/40">({traits.length})</span>
                </div>
                <motion.button
                  onClick={handleNewTrait}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 rounded transition-colors"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <FontAwesomeIcon icon={faPlus} size="xs" />
                  New
                </motion.button>
              </div>

              {traits.length === 0 ? (
                <div className="text-xs text-white/40 py-4 text-center">
                  No traits yet. Create one to build composable personalities.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <AnimatePresence mode="popLayout">
                    {traits.map((trait, index) => (
                      <TraitCard
                        key={trait.name}
                        trait={trait}
                        onEdit={handleEditTrait}
                        onDelete={handleDeleteTrait}
                        staggerIndex={index}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="border-t border-white/10" />

            {/* MCP Servers Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-white/70">
                  <FontAwesomeIcon icon={faPlug} size="sm" className="text-cyan-400" />
                  <span className="text-xs font-medium uppercase tracking-wide">MCP Servers</span>
                  <span className="text-xs text-white/40">({mcpServers.length})</span>
                </div>
                <motion.button
                  onClick={handleNewMcpServer}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 rounded transition-colors"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <FontAwesomeIcon icon={faPlus} size="xs" />
                  New
                </motion.button>
              </div>

              {mcpServers.length === 0 ? (
                <div className="text-xs text-white/40 py-4 text-center">
                  No MCP servers yet. Add one to extend Claude's capabilities.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <AnimatePresence mode="popLayout">
                    {mcpServers.map((server, index) => (
                      <McpServerCard
                        key={server.name}
                        server={server}
                        onEdit={handleEditMcpServer}
                        onDelete={handleDeleteMcpServer}
                        staggerIndex={index}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="border-t border-white/10" />

            {/* Personalities Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-white/70">
                  <FontAwesomeIcon icon={faDna} size="sm" className="text-purple-400" />
                  <span className="text-xs font-medium uppercase tracking-wide">Personalities</span>
                  <span className="text-xs text-white/40">({personalities.length})</span>
                </div>
                <motion.button
                  onClick={handleNewPersonality}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 rounded transition-colors"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <FontAwesomeIcon icon={faPlus} size="xs" />
                  New
                </motion.button>
              </div>

              {personalities.length === 0 ? (
                <div className="text-xs text-white/40 py-4 text-center">
                  No personalities yet. Create one to combine traits.
                </div>
              ) : (
                <div className="grid gap-3">
                  <AnimatePresence mode="popLayout">
                    {personalities.map((personality, index) => (
                      <PersonalityCard
                        key={personality.name}
                        personality={personality}
                        onEdit={handleEditPersonality}
                        onDelete={handleDeletePersonality}
                        staggerIndex={index}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="border-t border-white/10" />

            {/* Projects Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-white/70">
                  <FontAwesomeIcon icon={faFolder} size="sm" className="text-blue-400" />
                  <span className="text-xs font-medium uppercase tracking-wide">Projects</span>
                  <span className="text-xs text-white/40">({projects.length})</span>
                </div>
                <motion.button
                  onClick={handleNewProject}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 rounded transition-colors"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <FontAwesomeIcon icon={faPlus} size="xs" />
                  New
                </motion.button>
              </div>

              {projects.length === 0 ? (
                <div className="text-xs text-white/40 py-4 text-center">
                  No projects yet. Add one to give Claude context about your work.
                </div>
              ) : (
                <div className="grid gap-3">
                  <AnimatePresence mode="popLayout">
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
                  </AnimatePresence>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
