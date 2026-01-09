import { useState, useEffect, useCallback, useMemo } from 'react'
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
  faCodeCompare,
  faArrowUp,
  faArrowDown,
  faFolder,
  faFolderOpen,
  faChevronRight,
  faPlus,
  faMinus,
  faXmark,
  faCloudArrowUp,
  faCloudArrowDown,
  faBox,
  faBoxOpen,
  faCodeCommit
} from '@fortawesome/free-solid-svg-icons'
import { ActionButton, IconButton, Card } from '../../_ui'

// Status icons and colors
const STATUS_CONFIG = {
  modified: { icon: 'M', color: 'text-yellow-400', bg: 'bg-yellow-400/20' },
  added: { icon: 'A', color: 'text-green-400', bg: 'bg-green-400/20' },
  deleted: { icon: 'D', color: 'text-red-400', bg: 'bg-red-400/20' },
  renamed: { icon: 'R', color: 'text-blue-400', bg: 'bg-blue-400/20' },
  copied: { icon: 'C', color: 'text-purple-400', bg: 'bg-purple-400/20' },
  untracked: { icon: '?', color: 'text-gray-400', bg: 'bg-gray-400/20' },
  unmerged: { icon: 'U', color: 'text-orange-400', bg: 'bg-orange-400/20' }
}

// Group files by directory
function groupFilesByDir(files) {
  const tree = {}
  files.forEach(({ file, status }) => {
    const parts = file.split('/')
    const fileName = parts.pop()
    const dir = parts.join('/') || '.'

    if (!tree[dir]) tree[dir] = []
    tree[dir].push({ file, fileName, status })
  })
  return tree
}

// Relative time formatting
function relativeTime(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

// File tree component with directory grouping
function FileTree({ files, type, selectedFile, onSelectFile, onStage, onUnstage, onDiscard }) {
  const [expandedDirs, setExpandedDirs] = useState(new Set(['.']))

  if (!files || files.length === 0) return null

  const grouped = groupFilesByDir(files)
  const dirs = Object.keys(grouped).sort()

  const typeConfig = {
    staged: { label: 'Staged', color: 'text-green-400' },
    unstaged: { label: 'Modified', color: 'text-yellow-400' },
    untracked: { label: 'Untracked', color: 'text-gray-400' }
  }

  const config = typeConfig[type]

  const toggleDir = (dir) => {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(dir)) next.delete(dir)
      else next.add(dir)
      return next
    })
  }

  const allFiles = files.map(f => f.file)

  return (
    <div className="mb-3">
      <div className={`flex items-center justify-between text-xs font-medium uppercase tracking-wider mb-1.5 px-1 ${config.color}`}>
        <span>{config.label} ({files.length})</span>
        <div className="flex gap-1">
          {type === 'staged' && files.length > 0 && (
            <button
              onClick={() => onUnstage(allFiles)}
              className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-text-tertiary hover:text-yellow-400 transition-colors"
              title="Unstage all"
            >
              Unstage All
            </button>
          )}
          {type !== 'staged' && files.length > 0 && (
            <button
              onClick={() => onStage(allFiles)}
              className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-text-tertiary hover:text-green-400 transition-colors"
              title="Stage all"
            >
              Stage All
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        {dirs.map(dir => {
          const dirFiles = grouped[dir]
          const isExpanded = expandedDirs.has(dir)
          const isRoot = dir === '.'

          return (
            <div key={dir}>
              {!isRoot && (
                <div
                  onClick={() => toggleDir(dir)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer hover:bg-white/5 text-text-secondary"
                >
                  <FontAwesomeIcon
                    icon={faChevronRight}
                    className={`text-[10px] transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  />
                  <FontAwesomeIcon
                    icon={isExpanded ? faFolderOpen : faFolder}
                    className="text-xs text-yellow-500/70"
                  />
                  <span className="text-xs truncate">{dir}/</span>
                  <span className="text-[10px] text-text-tertiary">({dirFiles.length})</span>
                </div>
              )}

              {(isRoot || isExpanded) && dirFiles.map(({ file, fileName, status }) => {
                const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.modified

                return (
                  <div
                    key={file}
                    className={`group flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors ${
                      selectedFile === file ? 'bg-accent/20' : 'hover:bg-white/5'
                    }`}
                    style={{ paddingLeft: isRoot ? '8px' : '28px' }}
                    onClick={() => onSelectFile(file, type)}
                  >
                    <span className={`w-4 h-4 flex items-center justify-center text-[10px] font-mono rounded ${statusCfg.bg} ${statusCfg.color}`}>
                      {statusCfg.icon}
                    </span>
                    <FontAwesomeIcon icon={faFile} className="text-xs text-text-tertiary flex-shrink-0" />
                    <span className="flex-1 text-xs text-text-primary truncate min-w-0">{fileName}</span>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      {type === 'staged' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onUnstage([file]) }}
                          className="p-1 text-text-tertiary hover:text-yellow-400 transition-colors"
                          title="Unstage"
                        >
                          <FontAwesomeIcon icon={faCircleMinus} className="text-xs" />
                        </button>
                      )}
                      {type === 'unstaged' && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); onStage([file]) }}
                            className="p-1 text-text-tertiary hover:text-green-400 transition-colors"
                            title="Stage"
                          >
                            <FontAwesomeIcon icon={faCirclePlus} className="text-xs" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); onDiscard([file]) }}
                            className="p-1 text-text-tertiary hover:text-red-400 transition-colors"
                            title="Discard"
                          >
                            <FontAwesomeIcon icon={faTrash} className="text-xs" />
                          </button>
                        </>
                      )}
                      {type === 'untracked' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onStage([file]) }}
                          className="p-1 text-text-tertiary hover:text-green-400 transition-colors"
                          title="Stage"
                        >
                          <FontAwesomeIcon icon={faCirclePlus} className="text-xs" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Diff viewer with line numbers
function DiffViewer({ diff, file, staged }) {
  if (!diff) {
    return (
      <div className="h-full flex items-center justify-center text-text-tertiary">
        <div className="text-center">
          <FontAwesomeIcon icon={faCodeCompare} className="text-4xl mb-3 opacity-30" />
          <p>Select a file to view diff</p>
        </div>
      </div>
    )
  }

  const lines = diff.split('\n')
  let oldLineNum = 0
  let newLineNum = 0

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-black/20">
        <FontAwesomeIcon icon={faFile} className="text-sm text-text-tertiary" />
        <span className="text-sm text-text-primary flex-1 truncate">{file}</span>
        {staged && (
          <span className="px-2 py-0.5 text-xs rounded bg-green-500/20 text-green-400">staged</span>
        )}
      </div>
      <div className="flex-1 overflow-auto font-mono text-xs">
        {lines.map((line, i) => {
          let bgClass = ''
          let textClass = 'text-text-secondary'
          let lineNumOld = ''
          let lineNumNew = ''

          // Parse hunk header
          if (line.startsWith('@@')) {
            const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/)
            if (match) {
              oldLineNum = parseInt(match[1], 10) - 1
              newLineNum = parseInt(match[2], 10) - 1
            }
            textClass = 'text-cyan-400'
            bgClass = 'bg-cyan-500/10'
          } else if (line.startsWith('+') && !line.startsWith('+++')) {
            newLineNum++
            lineNumNew = newLineNum
            bgClass = 'bg-green-500/10'
            textClass = 'text-green-400'
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            oldLineNum++
            lineNumOld = oldLineNum
            bgClass = 'bg-red-500/10'
            textClass = 'text-red-400'
          } else if (line.startsWith('diff') || line.startsWith('index') || line.startsWith('+++') || line.startsWith('---')) {
            textClass = 'text-text-tertiary'
          } else if (!line.startsWith('\\')) {
            oldLineNum++
            newLineNum++
            lineNumOld = oldLineNum
            lineNumNew = newLineNum
          }

          return (
            <div key={i} className={`flex ${bgClass}`}>
              <span className="w-10 text-right pr-2 text-text-tertiary select-none border-r border-white/5">
                {lineNumOld}
              </span>
              <span className="w-10 text-right pr-2 text-text-tertiary select-none border-r border-white/10">
                {lineNumNew}
              </span>
              <span className={`flex-1 px-3 py-0.5 ${textClass} whitespace-pre`}>
                {line || ' '}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Commit modal
function CommitModal({ onClose, onCommit, stagedCount }) {
  const [message, setMessage] = useState('')
  const [description, setDescription] = useState('')
  const [amend, setAmend] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!message.trim()) return
    const fullMessage = description.trim()
      ? `${message.trim()}\n\n${description.trim()}`
      : message.trim()
    onCommit(fullMessage, amend)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[500px] bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-medium text-text-primary">Commit Changes</h3>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition-colors">
            <FontAwesomeIcon icon={faXmark} className="text-text-tertiary" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4">
          <div className="text-xs text-text-tertiary mb-3">
            {stagedCount} file{stagedCount !== 1 ? 's' : ''} staged
          </div>

          <input
            type="text"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Commit message (required)"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 mb-2"
            autoFocus
          />

          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Extended description (optional)"
            rows={4}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 resize-none mb-3"
          />

          <label className="flex items-center gap-2 text-xs text-text-secondary mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={amend}
              onChange={e => setAmend(e.target.checked)}
              className="rounded border-white/20"
            />
            Amend previous commit
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-secondary hover:bg-white/5 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!message.trim()}
              className="px-4 py-2 text-sm bg-accent text-black rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Commit
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Commit list for history view
function CommitList({ commits, selectedCommit, onSelectCommit, currentBranch }) {
  if (!commits || commits.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-text-tertiary text-sm">
        No commits found
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      {commits.map((commit, i) => {
        const isSelected = selectedCommit?.hash === commit.hash
        const isMerge = commit.parents.length > 1

        return (
          <div
            key={commit.hash}
            onClick={() => onSelectCommit(commit)}
            className={`flex gap-3 px-3 py-2 cursor-pointer border-l-2 transition-colors ${
              isSelected
                ? 'bg-accent/10 border-accent'
                : 'hover:bg-white/5 border-transparent'
            }`}
          >
            {/* Graph visualization */}
            <div className="w-4 flex flex-col items-center pt-1">
              <div className={`w-2.5 h-2.5 rounded-full ${isMerge ? 'bg-purple-400' : 'bg-accent'}`} />
              {i < commits.length - 1 && (
                <div className="w-0.5 flex-1 bg-white/20 mt-1" />
              )}
            </div>

            {/* Commit info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-accent">{commit.short}</span>
                {i === 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-green-500/20 text-green-400">
                    {currentBranch || 'HEAD'}
                  </span>
                )}
                {isMerge && (
                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-purple-500/20 text-purple-400">
                    merge
                  </span>
                )}
              </div>
              <div className="text-sm text-text-primary truncate mt-0.5">{commit.subject}</div>
              <div className="flex items-center gap-2 text-xs text-text-tertiary mt-0.5">
                <span>{commit.author}</span>
                <span>•</span>
                <span>{relativeTime(commit.date)}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Commit detail panel
function CommitDetail({ commit, onFileClick, selectedFile, diff }) {
  if (!commit) {
    return (
      <div className="h-full flex items-center justify-center text-text-tertiary">
        <div className="text-center">
          <FontAwesomeIcon icon={faCodeCommit} className="text-4xl mb-3 opacity-30" />
          <p>Select a commit to view details</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Commit header */}
      <div className="p-4 border-b border-border bg-black/20">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-mono text-accent text-sm">{commit.hash?.slice(0, 8)}</span>
        </div>
        <h3 className="text-base font-medium text-text-primary mb-1">{commit.subject}</h3>
        {commit.body && (
          <p className="text-sm text-text-secondary whitespace-pre-wrap mb-2">{commit.body}</p>
        )}
        <div className="flex items-center gap-3 text-xs text-text-tertiary">
          <span>{commit.author} &lt;{commit.email}&gt;</span>
          <span>•</span>
          <span>{commit.date && relativeTime(commit.date)}</span>
        </div>
      </div>

      {/* Changed files */}
      {commit.files && commit.files.length > 0 && (
        <div className="border-b border-border">
          <div className="px-4 py-2 text-xs text-text-tertiary uppercase tracking-wider">
            Changed Files ({commit.files.length})
          </div>
          <div className="max-h-32 overflow-y-auto">
            {commit.files.map(({ file, status }) => {
              const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.modified
              return (
                <div
                  key={file}
                  onClick={() => onFileClick(file)}
                  className={`flex items-center gap-2 px-4 py-1.5 cursor-pointer transition-colors ${
                    selectedFile === file ? 'bg-accent/20' : 'hover:bg-white/5'
                  }`}
                >
                  <span className={`w-4 h-4 flex items-center justify-center text-[10px] font-mono rounded ${cfg.bg} ${cfg.color}`}>
                    {cfg.icon}
                  </span>
                  <span className="text-xs text-text-primary truncate">{file}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Diff */}
      <div className="flex-1 overflow-auto font-mono text-xs">
        {diff ? (
          diff.split('\n').map((line, i) => {
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
          })
        ) : (
          <div className="p-4 text-text-tertiary">
            {commit.files?.length > 0 ? 'Select a file to view diff' : 'No changes in this commit'}
          </div>
        )}
      </div>
    </div>
  )
}

// Stash list component
function StashList({ stashes, onApply, onPop, onDrop }) {
  if (!stashes || stashes.length === 0) {
    return (
      <div className="text-xs text-text-tertiary p-2">No stashes</div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {stashes.map((stash, i) => (
        <div key={stash.ref} className="group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5">
          <FontAwesomeIcon icon={faBox} className="text-xs text-purple-400" />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-text-primary truncate">{stash.message}</div>
            <div className="text-[10px] text-text-tertiary">{relativeTime(stash.date)}</div>
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onApply(i)}
              className="px-1.5 py-0.5 text-[10px] rounded bg-white/5 hover:bg-white/10 text-text-tertiary hover:text-green-400"
              title="Apply"
            >
              Apply
            </button>
            <button
              onClick={() => onPop(i)}
              className="px-1.5 py-0.5 text-[10px] rounded bg-white/5 hover:bg-white/10 text-text-tertiary hover:text-blue-400"
              title="Pop"
            >
              Pop
            </button>
            <button
              onClick={() => onDrop(i)}
              className="px-1.5 py-0.5 text-[10px] rounded bg-white/5 hover:bg-white/10 text-text-tertiary hover:text-red-400"
              title="Drop"
            >
              Drop
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// Main Git View component
export default function GitView({ send }) {
  const [projects, setProjects] = useState([])
  const [projectsFetched, setProjectsFetched] = useState(false)
  const [selectedProject, setSelectedProject] = useState(null)
  const [projectStatuses, setProjectStatuses] = useState({})
  const [selectedFile, setSelectedFile] = useState(null)
  const [selectedFileType, setSelectedFileType] = useState(null)
  const [diff, setDiff] = useState(null)
  const [mode, setMode] = useState('working') // 'working' | 'history'
  const [commits, setCommits] = useState([])
  const [branches, setBranches] = useState({ all: [], current: '' })
  const [selectedCommit, setSelectedCommit] = useState(null)
  const [commitDetails, setCommitDetails] = useState(null)
  const [commitDiff, setCommitDiff] = useState(null)
  const [commitDiffFile, setCommitDiffFile] = useState(null)
  const [stashes, setStashes] = useState([])
  const [showCommitModal, setShowCommitModal] = useState(false)
  const [loading, setLoading] = useState({})
  const [error, setError] = useState(null)

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
              ahead: msg.ahead,
              behind: msg.behind,
              noUpstream: msg.noUpstream,
              staged: msg.staged,
              unstaged: msg.unstaged,
              untracked: msg.untracked
            }
          }))
        }

        if (msg.event === 'git:diff:response') {
          setDiff(msg.diff)
        }

        if (msg.event === 'git:commits:response') {
          setCommits(msg.commits || [])
        }

        if (msg.event === 'git:branches:response') {
          setBranches({ all: msg.branches || [], current: msg.current })
        }

        if (msg.event === 'git:commit:details:response') {
          setCommitDetails({
            hash: msg.hash,
            subject: msg.subject,
            body: msg.body,
            author: msg.author,
            email: msg.email,
            date: msg.date,
            parents: msg.parents,
            files: msg.files
          })
        }

        if (msg.event === 'git:commit:diff:response') {
          setCommitDiff(msg.diff)
          setCommitDiffFile(msg.file)
        }

        if (msg.event === 'git:stash:list:response') {
          setStashes(msg.stashes || [])
        }

        if (msg.event === 'git:error') {
          setError(msg.error)
          setTimeout(() => setError(null), 5000)
        }

        // Clear loading states on response
        if (msg.event.endsWith(':response')) {
          setLoading(prev => ({ ...prev, [msg.event.replace(':response', '')]: false }))
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

  // Load commits and branches when switching to history mode
  useEffect(() => {
    if (mode === 'history' && selectedProject && send) {
      send({ event: 'git:commits', project: selectedProject.path })
      send({ event: 'git:branches', project: selectedProject.path })
    }
  }, [mode, selectedProject, send])

  // Load stashes for current project
  useEffect(() => {
    if (selectedProject && send) {
      send({ event: 'git:stash:list', project: selectedProject.path })
    }
  }, [selectedProject, send])

  // Load commit details when selected
  useEffect(() => {
    if (selectedCommit && selectedProject && send) {
      send({ event: 'git:commit:details', project: selectedProject.path, hash: selectedCommit.hash })
      setCommitDiff(null)
      setCommitDiffFile(null)
    }
  }, [selectedCommit, selectedProject, send])

  const handleRefreshProject = useCallback((project) => {
    send({ event: 'git:status', project: project.path })
    if (mode === 'history') {
      send({ event: 'git:commits', project: project.path })
      send({ event: 'git:branches', project: project.path })
    }
    send({ event: 'git:stash:list', project: project.path })
  }, [send, mode])

  const handleProjectChange = useCallback((path) => {
    const project = projects.find(p => p.path === path)
    if (project) {
      setSelectedProject(project)
      setSelectedFile(null)
      setDiff(null)
      setSelectedCommit(null)
      setCommitDetails(null)
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
    if (selectedProject && confirm(`Discard changes to ${files.length} file(s)? This cannot be undone.`)) {
      send({ event: 'git:discard', project: selectedProject.path, files })
    }
  }, [send, selectedProject])

  const handleCommit = useCallback((message, amend) => {
    if (selectedProject) {
      send({ event: 'git:commit', project: selectedProject.path, message, amend })
    }
  }, [send, selectedProject])

  const handlePush = useCallback(() => {
    if (selectedProject) {
      setLoading(prev => ({ ...prev, push: true }))
      send({ event: 'git:push', project: selectedProject.path })
    }
  }, [send, selectedProject])

  const handlePull = useCallback(() => {
    if (selectedProject) {
      setLoading(prev => ({ ...prev, pull: true }))
      send({ event: 'git:pull', project: selectedProject.path })
    }
  }, [send, selectedProject])

  const handleFetch = useCallback(() => {
    if (selectedProject) {
      setLoading(prev => ({ ...prev, fetch: true }))
      send({ event: 'git:fetch', project: selectedProject.path })
    }
  }, [send, selectedProject])

  const handleStashCreate = useCallback((message) => {
    if (selectedProject) {
      send({ event: 'git:stash:create', project: selectedProject.path, message })
    }
  }, [send, selectedProject])

  const handleStashApply = useCallback((index) => {
    if (selectedProject) {
      send({ event: 'git:stash:apply', project: selectedProject.path, index })
    }
  }, [send, selectedProject])

  const handleStashPop = useCallback((index) => {
    if (selectedProject) {
      send({ event: 'git:stash:pop', project: selectedProject.path, index })
    }
  }, [send, selectedProject])

  const handleStashDrop = useCallback((index) => {
    if (selectedProject && confirm('Drop this stash? This cannot be undone.')) {
      send({ event: 'git:stash:drop', project: selectedProject.path, index })
    }
  }, [send, selectedProject])

  const handleCommitFileClick = useCallback((file) => {
    if (selectedCommit && selectedProject) {
      send({
        event: 'git:commit:diff',
        project: selectedProject.path,
        hash: selectedCommit.hash,
        file
      })
    }
  }, [send, selectedProject, selectedCommit])

  const currentStatus = selectedProject ? projectStatuses[selectedProject.path] : null
  const stagedCount = currentStatus?.staged?.length || 0
  const hasChanges = stagedCount > 0 || (currentStatus?.unstaged?.length || 0) > 0 || (currentStatus?.untracked?.length || 0) > 0

  return (
    <div className="h-full flex flex-col">
      {/* Error toast */}
      {error && (
        <div className="absolute top-4 right-4 z-50 px-4 py-2 bg-red-500/20 border border-red-500/30 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-4 flex-shrink-0">
        {/* Mode tabs */}
        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
          <button
            onClick={() => setMode('working')}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              mode === 'working' ? 'bg-accent text-black' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Working Tree
          </button>
          <button
            onClick={() => setMode('history')}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              mode === 'history' ? 'bg-accent text-black' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            History
          </button>
        </div>

        <div className="flex-1" />

        {/* Remote actions */}
        {currentStatus && (
          <div className="flex items-center gap-1">
            <button
              onClick={handleFetch}
              disabled={loading.fetch}
              className="px-2 py-1.5 text-xs rounded-lg bg-white/5 hover:bg-white/10 text-text-secondary transition-colors disabled:opacity-50"
              title="Fetch"
            >
              <FontAwesomeIcon icon={faRotate} className={loading.fetch ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={handlePull}
              disabled={loading.pull || currentStatus.behind === 0}
              className="flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-lg bg-white/5 hover:bg-white/10 text-text-secondary transition-colors disabled:opacity-50"
              title="Pull"
            >
              <FontAwesomeIcon icon={faCloudArrowDown} className={loading.pull ? 'animate-pulse' : ''} />
              {currentStatus.behind > 0 && <span className="text-blue-400">{currentStatus.behind}</span>}
            </button>
            <button
              onClick={handlePush}
              disabled={loading.push || currentStatus.ahead === 0}
              className="flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-lg bg-white/5 hover:bg-white/10 text-text-secondary transition-colors disabled:opacity-50"
              title="Push"
            >
              <FontAwesomeIcon icon={faCloudArrowUp} className={loading.push ? 'animate-pulse' : ''} />
              {currentStatus.ahead > 0 && <span className="text-green-400">{currentStatus.ahead}</span>}
            </button>
          </div>
        )}

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
              <IconButton
                icon={faRotate}
                onClick={() => handleRefreshProject(selectedProject)}
                title="Refresh"
              />
            )}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex gap-4 min-h-0">
        {mode === 'working' ? (
          <>
            {/* Left sidebar - branch info and files */}
            <div className="w-72 flex flex-col gap-3 overflow-hidden">
              {/* Branch info */}
              {selectedProject && currentStatus && (
                <Card compact>
                  <div className="flex items-center gap-2 text-sm text-text-primary">
                    <FontAwesomeIcon icon={faCodeBranch} className="text-accent" />
                    <span className="font-medium">{currentStatus.branch || 'detached'}</span>
                    {currentStatus.noUpstream && (
                      <span className="text-[10px] text-text-tertiary">(no upstream)</span>
                    )}
                  </div>
                  <div className="flex gap-3 mt-1.5 text-xs">
                    {currentStatus.ahead > 0 && (
                      <span className="flex items-center gap-1 text-green-400">
                        <FontAwesomeIcon icon={faArrowUp} className="text-[10px]" />
                        {currentStatus.ahead}
                      </span>
                    )}
                    {currentStatus.behind > 0 && (
                      <span className="flex items-center gap-1 text-blue-400">
                        <FontAwesomeIcon icon={faArrowDown} className="text-[10px]" />
                        {currentStatus.behind}
                      </span>
                    )}
                    {currentStatus.staged?.length > 0 && (
                      <span className="text-green-400">{currentStatus.staged.length} staged</span>
                    )}
                    {currentStatus.unstaged?.length > 0 && (
                      <span className="text-yellow-400">{currentStatus.unstaged.length} modified</span>
                    )}
                  </div>
                </Card>
              )}

              {/* Stashes */}
              {stashes.length > 0 && (
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider mb-1.5 px-1 text-purple-400">
                    <span className="flex items-center gap-1.5">
                      <FontAwesomeIcon icon={faBoxOpen} />
                      Stashes ({stashes.length})
                    </span>
                  </div>
                  <StashList
                    stashes={stashes}
                    onApply={handleStashApply}
                    onPop={handleStashPop}
                    onDrop={handleStashDrop}
                  />
                </div>
              )}

              {/* File tree */}
              {selectedProject && currentStatus && (
                <div className="flex-1 overflow-y-auto border-t border-border pt-3">
                  <FileTree
                    files={currentStatus.staged}
                    type="staged"
                    selectedFile={selectedFile}
                    onSelectFile={handleSelectFile}
                    onStage={handleStage}
                    onUnstage={handleUnstage}
                    onDiscard={handleDiscard}
                  />
                  <FileTree
                    files={currentStatus.unstaged}
                    type="unstaged"
                    selectedFile={selectedFile}
                    onSelectFile={handleSelectFile}
                    onStage={handleStage}
                    onUnstage={handleUnstage}
                    onDiscard={handleDiscard}
                  />
                  <FileTree
                    files={currentStatus.untracked}
                    type="untracked"
                    selectedFile={selectedFile}
                    onSelectFile={handleSelectFile}
                    onStage={handleStage}
                    onUnstage={handleUnstage}
                    onDiscard={handleDiscard}
                  />

                  {!hasChanges && (
                    <div className="text-xs text-text-tertiary text-center py-8">
                      No changes
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons */}
              {selectedProject && currentStatus && (
                <div className="flex-shrink-0 flex gap-2 pt-2 border-t border-border">
                  {hasChanges && (
                    <button
                      onClick={() => handleStashCreate()}
                      className="flex-1 px-3 py-2 text-xs bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg transition-colors"
                    >
                      <FontAwesomeIcon icon={faBox} className="mr-1.5" />
                      Stash
                    </button>
                  )}
                  <button
                    onClick={() => setShowCommitModal(true)}
                    disabled={stagedCount === 0}
                    className="flex-1 px-3 py-2 text-xs bg-accent hover:bg-accent/90 text-black rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <FontAwesomeIcon icon={faCheck} className="mr-1.5" />
                    Commit ({stagedCount})
                  </button>
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
          </>
        ) : (
          <>
            {/* History view: commits list + detail panel */}
            <div className="w-80 flex flex-col border-r border-border overflow-hidden">
              <div className="px-3 py-2 border-b border-border text-xs text-text-tertiary uppercase tracking-wider">
                Commits ({commits.length})
              </div>
              <CommitList
                commits={commits}
                selectedCommit={selectedCommit}
                onSelectCommit={setSelectedCommit}
                currentBranch={branches.current}
              />
            </div>

            <div className="flex-1 bg-black/20 border border-white/10 rounded-xl overflow-hidden">
              <CommitDetail
                commit={commitDetails || selectedCommit}
                onFileClick={handleCommitFileClick}
                selectedFile={commitDiffFile}
                diff={commitDiff}
              />
            </div>
          </>
        )}
      </div>

      {/* Commit modal */}
      {showCommitModal && (
        <CommitModal
          onClose={() => setShowCommitModal(false)}
          onCommit={handleCommit}
          stagedCount={stagedCount}
        />
      )}
    </div>
  )
}
