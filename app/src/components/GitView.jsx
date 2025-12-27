import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../store'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCodeBranch,
  faPlus,
  faFolderOpen,
  faChevronDown,
  faChevronRight,
  faFile,
  faCirclePlus,
  faCircleMinus,
  faPencil,
  faTrash,
  faCheck,
  faXmark,
  faRotate,
  faCodeCompare
} from '@fortawesome/free-solid-svg-icons'

function ProjectCard({ project, isSelected, onSelect, onRemove, status, onRefresh }) {
  const [expanded, setExpanded] = useState(true)

  const totalChanges = (status?.staged?.length || 0) +
    (status?.unstaged?.length || 0) +
    (status?.untracked?.length || 0)

  return (
    <div className={`rounded-lg border transition-colors ${
      isSelected ? 'bg-accent/10 border-accent/30' : 'bg-black/20 border-white/10 hover:border-white/20'
    }`}>
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={() => onSelect(project)}
      >
        <button
          onClick={(e) => {
            e.stopPropagation()
            setExpanded(!expanded)
          }}
          className="text-text-tertiary hover:text-text-primary transition-colors"
        >
          <FontAwesomeIcon icon={expanded ? faChevronDown : faChevronRight} className="text-xs" />
        </button>
        <FontAwesomeIcon icon={faFolderOpen} className="text-accent text-sm" />
        <span className="flex-1 text-sm text-text-primary truncate">{project.name}</span>
        {totalChanges > 0 && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-accent/20 text-accent">
            {totalChanges}
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRefresh(project)
          }}
          className="text-text-tertiary hover:text-text-primary transition-colors"
          title="Refresh"
        >
          <FontAwesomeIcon icon={faRotate} className="text-xs" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove(project)
          }}
          className="text-text-tertiary hover:text-red-400 transition-colors"
          title="Remove project"
        >
          <FontAwesomeIcon icon={faXmark} className="text-xs" />
        </button>
      </div>

      {expanded && status && (
        <div className="px-3 pb-2 text-xs text-text-tertiary">
          <div className="flex items-center gap-1 mb-1">
            <FontAwesomeIcon icon={faCodeBranch} className="text-xs" />
            <span>{status.branch || 'detached'}</span>
          </div>
          {status.staged?.length > 0 && (
            <div className="text-green-400">{status.staged.length} staged</div>
          )}
          {status.unstaged?.length > 0 && (
            <div className="text-yellow-400">{status.unstaged.length} modified</div>
          )}
          {status.untracked?.length > 0 && (
            <div className="text-gray-400">{status.untracked.length} untracked</div>
          )}
        </div>
      )}
    </div>
  )
}

function FileList({ files, type, selectedFile, onSelectFile, onStage, onUnstage, onDiscard }) {
  if (!files || files.length === 0) return null

  const typeConfig = {
    staged: { label: 'Staged', color: 'text-green-400', icon: faCheck },
    unstaged: { label: 'Modified', color: 'text-yellow-400', icon: faPencil },
    untracked: { label: 'Untracked', color: 'text-gray-400', icon: faCirclePlus }
  }

  const config = typeConfig[type]

  return (
    <div className="mb-3">
      <div className={`text-xs font-medium uppercase tracking-wider mb-1 px-1 ${config.color}`}>
        {config.label} ({files.length})
      </div>
      <div className="flex flex-col gap-0.5">
        {files.map(({ file, status }) => (
          <div
            key={file}
            className={`group flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors ${
              selectedFile === file ? 'bg-accent/20' : 'hover:bg-white/5'
            }`}
            onClick={() => onSelectFile(file, type)}
          >
            <FontAwesomeIcon icon={faFile} className="text-xs text-text-tertiary flex-shrink-0" />
            <span className="flex-1 text-xs text-text-primary truncate min-w-0">{file}</span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              {type === 'staged' && (
                <button
                  onClick={(e) => { e.stopPropagation(); onUnstage([file]) }}
                  className="text-text-tertiary hover:text-yellow-400 transition-colors"
                  title="Unstage"
                >
                  <FontAwesomeIcon icon={faCircleMinus} className="text-xs" />
                </button>
              )}
              {type === 'unstaged' && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); onStage([file]) }}
                    className="text-text-tertiary hover:text-green-400 transition-colors"
                    title="Stage"
                  >
                    <FontAwesomeIcon icon={faCirclePlus} className="text-xs" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDiscard([file]) }}
                    className="text-text-tertiary hover:text-red-400 transition-colors"
                    title="Discard"
                  >
                    <FontAwesomeIcon icon={faTrash} className="text-xs" />
                  </button>
                </>
              )}
              {type === 'untracked' && (
                <button
                  onClick={(e) => { e.stopPropagation(); onStage([file]) }}
                  className="text-text-tertiary hover:text-green-400 transition-colors"
                  title="Stage"
                >
                  <FontAwesomeIcon icon={faCirclePlus} className="text-xs" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DiffViewer({ diff, file, staged }) {
  if (!diff) {
    return (
      <div className="h-full flex items-center justify-center text-text-tertiary">
        Select a file to view diff
      </div>
    )
  }

  const lines = diff.split('\n')

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-black/20">
        <FontAwesomeIcon icon={faFile} className="text-sm text-text-tertiary" />
        <span className="text-sm text-text-primary">{file}</span>
        {staged && (
          <span className="px-2 py-0.5 text-xs rounded bg-green-500/20 text-green-400">staged</span>
        )}
      </div>
      <div className="flex-1 overflow-auto font-mono text-xs">
        {lines.map((line, i) => {
          let bgClass = ''
          let textClass = 'text-text-secondary'

          if (line.startsWith('+') && !line.startsWith('+++')) {
            bgClass = 'bg-green-500/10'
            textClass = 'text-green-400'
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            bgClass = 'bg-red-500/10'
            textClass = 'text-red-400'
          } else if (line.startsWith('@@')) {
            textClass = 'text-cyan-400'
          } else if (line.startsWith('diff') || line.startsWith('index')) {
            textClass = 'text-text-tertiary'
          }

          return (
            <div key={i} className={`px-4 py-0.5 ${bgClass} ${textClass} whitespace-pre`}>
              {line || ' '}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function GitView({ send }) {
  const gitProjects = useStore(s => s.gitProjects) || []

  const [selectedProject, setSelectedProject] = useState(null)
  const [projectStatuses, setProjectStatuses] = useState({})
  const [selectedFile, setSelectedFile] = useState(null)
  const [selectedFileType, setSelectedFileType] = useState(null)
  const [diff, setDiff] = useState(null)
  const [mode, setMode] = useState('working') // 'working' | 'compare'

  // Load project statuses when projects change
  useEffect(() => {
    gitProjects.forEach(project => {
      send({ event: 'git:status', project: project.path })
    })
  }, [gitProjects, send])

  // Auto-select first project
  useEffect(() => {
    if (gitProjects.length > 0 && !selectedProject) {
      setSelectedProject(gitProjects[0])
    }
  }, [gitProjects, selectedProject])

  // Handle WebSocket messages
  useEffect(() => {
    const handleMessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        if (msg.event === 'git:status:response') {
          setProjectStatuses(prev => ({
            ...prev,
            [msg.project]: {
              branch: msg.branch,
              staged: msg.staged,
              unstaged: msg.unstaged,
              untracked: msg.untracked
            }
          }))
        }

        if (msg.event === 'git:diff:response') {
          setDiff(msg.diff)
        }

        if (msg.event === 'git:error') {
          console.error('Git error:', msg.error)
        }
      } catch {}
    }

    const ws = window.__irisWs
    if (ws) {
      ws.addEventListener('message', handleMessage)
      return () => ws.removeEventListener('message', handleMessage)
    }
  }, [])

  const handleAddProject = useCallback(async () => {
    const path = await window.iris?.selectFolder()
    if (path) {
      send({ event: 'git:projects:add', path })
    }
  }, [send])

  const handleRemoveProject = useCallback((project) => {
    send({ event: 'git:projects:remove', path: project.path })
    if (selectedProject?.path === project.path) {
      setSelectedProject(null)
    }
  }, [send, selectedProject])

  const handleRefreshProject = useCallback((project) => {
    send({ event: 'git:status', project: project.path })
  }, [send])

  const handleSelectFile = useCallback((file, type) => {
    setSelectedFile(file)
    setSelectedFileType(type)
    if (selectedProject) {
      send({
        event: 'git:diff',
        project: selectedProject.path,
        file,
        staged: type === 'staged'
      })
    }
  }, [send, selectedProject])

  const handleStage = useCallback((files) => {
    if (selectedProject) {
      send({ event: 'git:stage', project: selectedProject.path, files })
    }
  }, [send, selectedProject])

  const handleUnstage = useCallback((files) => {
    if (selectedProject) {
      send({ event: 'git:unstage', project: selectedProject.path, files })
    }
  }, [send, selectedProject])

  const handleDiscard = useCallback((files) => {
    if (selectedProject) {
      send({ event: 'git:discard', project: selectedProject.path, files })
    }
  }, [send, selectedProject])

  const currentStatus = selectedProject ? projectStatuses[selectedProject.path] : null

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode('working')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              mode === 'working'
                ? 'bg-accent/20 text-accent border border-accent/30'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <FontAwesomeIcon icon={faCodeBranch} className="mr-2" />
            Working Tree
          </button>
          <button
            onClick={() => setMode('compare')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              mode === 'compare'
                ? 'bg-accent/20 text-accent border border-accent/30'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <FontAwesomeIcon icon={faCodeCompare} className="mr-2" />
            Compare
          </button>
        </div>
        <div className="flex-1" />
        <button
          onClick={handleAddProject}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-accent/20 text-accent border border-accent/30 rounded-lg hover:bg-accent/30 transition-colors"
        >
          <FontAwesomeIcon icon={faPlus} />
          Add Project
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left sidebar - projects and files */}
        <div className="w-72 flex flex-col gap-4 overflow-y-auto">
          {/* Projects list */}
          <div className="flex flex-col gap-2">
            {gitProjects.length === 0 ? (
              <div className="text-center py-8 text-text-tertiary text-sm">
                No projects added yet
              </div>
            ) : (
              gitProjects.map(project => (
                <ProjectCard
                  key={project.path}
                  project={project}
                  isSelected={selectedProject?.path === project.path}
                  onSelect={setSelectedProject}
                  onRemove={handleRemoveProject}
                  onRefresh={handleRefreshProject}
                  status={projectStatuses[project.path]}
                />
              ))
            )}
          </div>

          {/* File tree for selected project */}
          {selectedProject && currentStatus && (
            <div className="border-t border-border pt-4">
              <FileList
                files={currentStatus.staged}
                type="staged"
                selectedFile={selectedFile}
                onSelectFile={handleSelectFile}
                onStage={handleStage}
                onUnstage={handleUnstage}
                onDiscard={handleDiscard}
              />
              <FileList
                files={currentStatus.unstaged}
                type="unstaged"
                selectedFile={selectedFile}
                onSelectFile={handleSelectFile}
                onStage={handleStage}
                onUnstage={handleUnstage}
                onDiscard={handleDiscard}
              />
              <FileList
                files={currentStatus.untracked}
                type="untracked"
                selectedFile={selectedFile}
                onSelectFile={handleSelectFile}
                onStage={handleStage}
                onUnstage={handleUnstage}
                onDiscard={handleDiscard}
              />
            </div>
          )}
        </div>

        {/* Right side - diff viewer */}
        <div className="flex-1 bg-black/20 border border-white/10 rounded-xl overflow-hidden">
          <DiffViewer
            diff={diff}
            file={selectedFile}
            staged={selectedFileType === 'staged'}
          />
        </div>
      </div>
    </div>
  )
}
