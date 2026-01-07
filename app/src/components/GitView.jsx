import { useState, useEffect, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCodeBranch,
  faFile,
  faCirclePlus,
  faCircleMinus,
  faPencil,
  faTrash,
  faCheck,
  faRotate,
  faCodeCompare
} from '@fortawesome/free-solid-svg-icons'

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
  const [projects, setProjects] = useState([])
  const [projectsFetched, setProjectsFetched] = useState(false)
  const [selectedProject, setSelectedProject] = useState(null)
  const [projectStatuses, setProjectStatuses] = useState({})
  const [selectedFile, setSelectedFile] = useState(null)
  const [selectedFileType, setSelectedFileType] = useState(null)
  const [diff, setDiff] = useState(null)
  const [mode, setMode] = useState('working') // 'working' | 'compare'

  // Fetch projects on mount
  useEffect(() => {
    if (!send) return
    send({ event: 'projects:list' })
  }, [send])

  // Handle WebSocket messages
  useEffect(() => {
    const handleMessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        if (msg.event === 'projects:list:response') {
          setProjects(msg.projects || [])
          setProjectsFetched(true)
        }

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

  // Load project statuses when projects are fetched
  useEffect(() => {
    if (!projectsFetched) return
    projects.forEach(project => {
      send({ event: 'git:status', project: project.path })
    })
  }, [projects, projectsFetched, send])

  // Auto-select default project
  useEffect(() => {
    if (projects.length > 0 && !selectedProject) {
      const defaultProject = projects.find(p => p.isDefault) || projects[0]
      setSelectedProject(defaultProject)
    }
  }, [projects, selectedProject])

  const handleRefreshProject = useCallback((project) => {
    send({ event: 'git:status', project: project.path })
  }, [send])

  const handleProjectChange = useCallback((path) => {
    const project = projects.find(p => p.path === path)
    if (project) {
      setSelectedProject(project)
      setSelectedFile(null)
      setDiff(null)
    }
  }, [projects])

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
        {/* Project selector */}
        {projects.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              value={selectedProject?.path || ''}
              onChange={(e) => handleProjectChange(e.target.value)}
              className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white/85 focus:outline-none focus:bg-white/8 focus:border-white/20 transition-all cursor-pointer"
            >
              {projects.map(p => (
                <option key={p.path} value={p.path} className="bg-[#1a1a1a]">
                  {p.name}{p.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
            {selectedProject && (
              <button
                onClick={() => handleRefreshProject(selectedProject)}
                className="p-1.5 text-text-tertiary hover:text-text-primary transition-colors"
                title="Refresh"
              >
                <FontAwesomeIcon icon={faRotate} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left sidebar - branch info and files */}
        <div className="w-72 flex flex-col gap-4 overflow-y-auto">
          {/* Branch info */}
          {selectedProject && currentStatus && (
            <div className="px-3 py-2 bg-black/20 border border-white/10 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-text-primary">
                <FontAwesomeIcon icon={faCodeBranch} className="text-accent" />
                <span>{currentStatus.branch || 'detached'}</span>
              </div>
              <div className="flex gap-3 mt-1 text-xs">
                {currentStatus.staged?.length > 0 && (
                  <span className="text-green-400">{currentStatus.staged.length} staged</span>
                )}
                {currentStatus.unstaged?.length > 0 && (
                  <span className="text-yellow-400">{currentStatus.unstaged.length} modified</span>
                )}
                {currentStatus.untracked?.length > 0 && (
                  <span className="text-gray-400">{currentStatus.untracked.length} untracked</span>
                )}
              </div>
            </div>
          )}

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
