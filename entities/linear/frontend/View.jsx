import { useState, useEffect, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faRotate,
  faCircle,
  faCheckCircle,
  faExclamationTriangle,
  faArrowUp,
  faArrowDown,
  faMinus,
  faExternalLink,
  faFilter,
  faPlus,
  faBolt,
  faPaperPlane,
  faChevronDown,
  faTimes
} from '@fortawesome/free-solid-svg-icons'
import { ActionButton, IconButton, Input, Card } from '../../_ui'

const STATUS_CONFIG = {
  'backlog': { color: 'text-gray-400', bg: 'bg-gray-500/20', label: 'Backlog' },
  'unstarted': { color: 'text-gray-400', bg: 'bg-gray-500/20', label: 'Todo' },
  'started': { color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: 'In Progress' },
  'completed': { color: 'text-green-400', bg: 'bg-green-500/20', label: 'Done' },
  'canceled': { color: 'text-red-400', bg: 'bg-red-500/20', label: 'Canceled' },
  'cancelled': { color: 'text-red-400', bg: 'bg-red-500/20', label: 'Cancelled' },
}

const PRIORITY_CONFIG = {
  0: { icon: faMinus, color: 'text-gray-500', label: 'No priority' },
  1: { icon: faArrowUp, color: 'text-red-500', label: 'Urgent' },
  2: { icon: faArrowUp, color: 'text-orange-500', label: 'High' },
  3: { icon: faMinus, color: 'text-yellow-500', label: 'Medium' },
  4: { icon: faArrowDown, color: 'text-blue-500', label: 'Low' },
}

function IssueCard({ issue, isSelected, onSelect }) {
  const statusKey = issue.state?.type?.toLowerCase() || 'unstarted'
  const statusConfig = STATUS_CONFIG[statusKey] || STATUS_CONFIG['unstarted']
  const priorityConfig = PRIORITY_CONFIG[issue.priority] || PRIORITY_CONFIG[0]

  return (
    <div
      className={`rounded-lg border transition-colors cursor-pointer ${
        isSelected
          ? 'bg-accent/10 border-accent/30'
          : 'bg-black/20 border-white/10 hover:border-white/20'
      }`}
      onClick={() => onSelect(issue)}
    >
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-text-tertiary font-mono">{issue.identifier}</span>
          <FontAwesomeIcon
            icon={priorityConfig.icon}
            className={`text-xs ${priorityConfig.color}`}
            title={priorityConfig.label}
          />
        </div>
        <div className="text-sm text-text-primary mb-2 line-clamp-2">
          {issue.title}
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 text-xs rounded ${statusConfig.bg} ${statusConfig.color}`}>
            {issue.state?.name || statusConfig.label}
          </span>
          {issue.project && (
            <span className="text-xs text-text-tertiary truncate">
              {issue.project.name}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusDropdown({ issue, states, onUpdate, loading }) {
  const [open, setOpen] = useState(false)
  const currentState = issue.state

  if (!states || states.length === 0) {
    return (
      <span className="px-2 py-0.5 text-xs rounded bg-gray-500/20 text-gray-400">
        {currentState?.name || 'Unknown'}
      </span>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-black/30 border border-white/10 hover:border-white/20 transition-colors disabled:opacity-50"
        style={{ color: currentState?.color || '#888' }}
      >
        {currentState?.name || 'Unknown'}
        <FontAwesomeIcon icon={faChevronDown} className="text-[10px] opacity-50" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-20 bg-bg-secondary border border-white/10 rounded-lg shadow-xl min-w-[140px] py-1">
            {states.map(state => (
              <button
                key={state.id}
                onClick={() => {
                  onUpdate(state.id)
                  setOpen(false)
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors ${
                  state.id === currentState?.id ? 'bg-white/10' : ''
                }`}
                style={{ color: state.color || '#888' }}
              >
                {state.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function CommentInput({ issueId, send, onCommentAdded }) {
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!body.trim() || sending) return

    setSending(true)
    send({ event: 'linear:comment:create', issueId, body: body.trim() })
    // Reset will happen when we get the response
  }

  // Listen for comment created
  useEffect(() => {
    const handleMessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.event === 'linear:comment:created' && msg.issueId === issueId) {
          setBody('')
          setSending(false)
          if (onCommentAdded) onCommentAdded(msg.comment)
        }
        if (msg.event === 'linear:error') {
          setSending(false)
        }
      } catch {}
    }

    const ws = window.__irisWs
    if (ws) {
      ws.addEventListener('message', handleMessage)
      return () => ws.removeEventListener('message', handleMessage)
    }
  }, [issueId, onCommentAdded])

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a comment..."
        disabled={sending}
        className="flex-1"
      />
      <IconButton
        icon={faPaperPlane}
        onClick={handleSubmit}
        disabled={!body.trim() || sending}
        spinning={sending}
        title="Send comment"
      />
    </form>
  )
}

function IssueDetails({ issue, states, send, onStatusUpdate, onAssignToGod }) {
  const [comments, setComments] = useState([])
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // Update comments when issue changes
  useEffect(() => {
    if (issue?.comments) {
      setComments(issue.comments)
    } else {
      setComments([])
    }
  }, [issue?.id, issue?.comments])

  const handleCommentAdded = useCallback((comment) => {
    setComments(prev => [...prev, comment])
  }, [])

  const handleStatusUpdate = useCallback((stateId) => {
    setUpdatingStatus(true)
    send({ event: 'linear:issue:update-status', issueId: issue.id, stateId })
  }, [issue?.id, send])

  // Listen for status update response
  useEffect(() => {
    const handleMessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.event === 'linear:issue:updated') {
          setUpdatingStatus(false)
          if (onStatusUpdate) onStatusUpdate(msg.issue)
        }
        if (msg.event === 'linear:error') {
          setUpdatingStatus(false)
        }
      } catch {}
    }

    const ws = window.__irisWs
    if (ws) {
      ws.addEventListener('message', handleMessage)
      return () => ws.removeEventListener('message', handleMessage)
    }
  }, [onStatusUpdate])

  if (!issue) {
    return (
      <div className="h-full flex items-center justify-center text-text-tertiary">
        Select an issue to view details
      </div>
    )
  }

  const priorityConfig = PRIORITY_CONFIG[issue.priority] || PRIORITY_CONFIG[0]

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-black/20">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm text-text-tertiary font-mono">{issue.identifier}</span>
          {issue.url && (
            <a
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-tertiary hover:text-accent transition-colors"
              title="Open in Linear"
            >
              <FontAwesomeIcon icon={faExternalLink} className="text-xs" />
            </a>
          )}
          <div className="flex-1" />
          <ActionButton
            variant="warning"
            icon={faBolt}
            compact
            onClick={() => onAssignToGod(issue)}
          >
            Assign to God
          </ActionButton>
        </div>
        <h2 className="text-lg text-text-primary font-medium">{issue.title}</h2>
      </div>

      {/* Meta */}
      <div className="px-4 py-3 border-b border-border flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary">Status:</span>
          <StatusDropdown
            issue={issue}
            states={states}
            onUpdate={handleStatusUpdate}
            loading={updatingStatus}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary">Priority:</span>
          <span className={`flex items-center gap-1 text-xs ${priorityConfig.color}`}>
            <FontAwesomeIcon icon={priorityConfig.icon} />
            {priorityConfig.label}
          </span>
        </div>
        {issue.project && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary">Project:</span>
            <span className="text-xs text-text-primary">{issue.project.name}</span>
          </div>
        )}
        {issue.team && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary">Team:</span>
            <span className="text-xs text-text-primary">{issue.team.name}</span>
          </div>
        )}
        {issue.dueDate && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary">Due:</span>
            <span className="text-xs text-text-primary">
              {new Date(issue.dueDate).toLocaleDateString()}
            </span>
          </div>
        )}
      </div>

      {/* Labels */}
      {issue.labels?.length > 0 && (
        <div className="px-4 py-2 border-b border-border flex flex-wrap gap-1">
          {issue.labels.map(label => (
            <span
              key={label.id}
              className="px-2 py-0.5 text-xs rounded-full"
              style={{
                backgroundColor: `${label.color}20`,
                color: label.color
              }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      {/* Description */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {issue.description ? (
          <div className="text-sm text-text-secondary whitespace-pre-wrap mb-4">
            {issue.description}
          </div>
        ) : (
          <div className="text-sm text-text-tertiary italic mb-4">
            No description
          </div>
        )}

        {/* Comments */}
        {comments.length > 0 && (
          <div className="border-t border-border pt-3 mt-3">
            <h3 className="text-xs text-text-tertiary uppercase tracking-wide mb-2">Comments</h3>
            <div className="space-y-2">
              {comments.map(comment => (
                <div key={comment.id} className="bg-black/20 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-text-primary font-medium">{comment.user?.name || 'Unknown'}</span>
                    <span className="text-xs text-text-tertiary">
                      {new Date(comment.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-sm text-text-secondary whitespace-pre-wrap">
                    {comment.body}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Branch name */}
      {issue.branchName && (
        <div className="px-4 py-2 border-t border-border bg-black/10">
          <span className="text-xs text-text-tertiary">Branch: </span>
          <code className="text-xs text-accent font-mono">{issue.branchName}</code>
        </div>
      )}

      {/* Comment input */}
      <div className="px-4 py-3 border-t border-border bg-black/10">
        <CommentInput issueId={issue.id} send={send} onCommentAdded={handleCommentAdded} />
      </div>
    </div>
  )
}

function CreateIssueModal({ teams, send, onClose, onCreated }) {
  const [title, setTitle] = useState('')
  const [teamId, setTeamId] = useState(teams[0]?.id || '')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState(0)
  const [creating, setCreating] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!title.trim() || !teamId || creating) return

    setCreating(true)
    send({
      event: 'linear:issue:create',
      title: title.trim(),
      teamId,
      description: description.trim() || undefined,
      priority: priority || undefined
    })
  }

  // Listen for issue created
  useEffect(() => {
    const handleMessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.event === 'linear:issue:created') {
          setCreating(false)
          if (onCreated) onCreated(msg.issue)
          onClose()
        }
        if (msg.event === 'linear:error') {
          setCreating(false)
        }
      } catch {}
    }

    const ws = window.__irisWs
    if (ws) {
      ws.addEventListener('message', handleMessage)
      return () => ws.removeEventListener('message', handleMessage)
    }
  }, [onClose, onCreated])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-bg-secondary border border-white/10 rounded-xl shadow-2xl w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg text-text-primary font-medium">New Issue</h2>
          <IconButton icon={faTimes} onClick={onClose} title="Close" />
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-xs text-text-tertiary mb-1">Title *</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Issue title"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs text-text-tertiary mb-1">Team *</label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:border-accent/50 text-text-primary"
            >
              {teams.map(team => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-text-tertiary mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:border-accent/50 text-text-primary"
            >
              <option value={0}>No priority</option>
              <option value={1}>Urgent</option>
              <option value={2}>High</option>
              <option value={3}>Medium</option>
              <option value={4}>Low</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-text-tertiary mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={4}
              className="w-full px-3 py-2 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:border-accent/50 text-text-primary placeholder:text-text-tertiary resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <ActionButton variant="ghost" onClick={onClose}>
              Cancel
            </ActionButton>
            <ActionButton
              variant="accent"
              disabled={!title.trim() || !teamId || creating}
              onClick={handleSubmit}
            >
              {creating ? 'Creating...' : 'Create Issue'}
            </ActionButton>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function LinearView({ send, connected }) {
  const [issues, setIssues] = useState([])
  const [selectedIssue, setSelectedIssue] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('active') // 'all' | 'active' | 'done'
  const [teams, setTeams] = useState([])
  const [states, setStates] = useState({}) // teamId -> states[]
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [hasFetched, setHasFetched] = useState(false)

  // Fetch issues and teams when connected (handles initial load and reconnects)
  useEffect(() => {
    if (connected && !hasFetched) {
      setHasFetched(true)
      setLoading(true)
      setError(null)
      send({ event: 'linear:issues:fetch', assignee: 'me' })
      send({ event: 'linear:teams:fetch' })
    }
  }, [connected, hasFetched, send])

  const fetchIssues = useCallback(() => {
    setLoading(true)
    setError(null)
    send({ event: 'linear:issues:fetch', assignee: 'me' })
  }, [send])

  const fetchTeams = useCallback(() => {
    send({ event: 'linear:teams:fetch' })
  }, [send])

  const fetchStates = useCallback((teamId) => {
    if (!states[teamId]) {
      send({ event: 'linear:states:fetch', teamId })
    }
  }, [send, states])

  // Handle WebSocket messages
  useEffect(() => {
    const handleMessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        if (msg.event === 'linear:issues:response') {
          setIssues(msg.issues || [])
          setLoading(false)
        }

        if (msg.event === 'linear:issue:response') {
          setSelectedIssue(msg.issue)
          // Fetch states for this issue's team
          if (msg.issue?.team?.id) {
            fetchStates(msg.issue.team.id)
          }
        }

        if (msg.event === 'linear:teams:response') {
          setTeams(msg.teams || [])
        }

        if (msg.event === 'linear:states:response') {
          setStates(prev => ({ ...prev, [msg.teamId]: msg.states }))
        }

        if (msg.event === 'linear:error') {
          setError(msg.error)
          setLoading(false)
        }
      } catch {}
    }

    const ws = window.__irisWs
    if (ws) {
      ws.addEventListener('message', handleMessage)
      return () => ws.removeEventListener('message', handleMessage)
    }
  }, [fetchStates])

  const handleSelectIssue = useCallback((issue) => {
    setSelectedIssue(issue)
    send({ event: 'linear:issue:get', id: issue.id })
  }, [send])

  const handleStatusUpdate = useCallback((updatedIssue) => {
    // Update the issue in the list
    setIssues(prev => prev.map(i =>
      i.id === updatedIssue.id ? { ...i, state: updatedIssue.state } : i
    ))
    // Update selected issue
    setSelectedIssue(prev => prev ? { ...prev, state: updatedIssue.state } : prev)
  }, [])

  const handleAssignToGod = useCallback((issue) => {
    // Format task for the god
    const task = `[${issue.identifier}] ${issue.title}${issue.description ? `\n\n${issue.description}` : ''}`
    send({ event: 'god:spawn', task })
  }, [send])

  const handleIssueCreated = useCallback((issue) => {
    // Refresh the list
    fetchIssues()
  }, [fetchIssues])

  // Filter issues
  const filteredIssues = issues.filter(issue => {
    const stateType = issue.state?.type?.toLowerCase()
    if (filter === 'active') {
      return stateType !== 'completed' && stateType !== 'canceled' && stateType !== 'cancelled'
    }
    if (filter === 'done') {
      return stateType === 'completed'
    }
    return true
  })

  // Get states for selected issue's team
  const currentStates = selectedIssue?.team?.id ? states[selectedIssue.team.id] : []

  return (
    <div className="h-full flex flex-col p-4">
      {/* Header */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <ActionButton
            variant={filter === 'active' ? 'accent' : 'ghost'}
            onClick={() => setFilter('active')}
          >
            Active
          </ActionButton>
          <ActionButton
            variant={filter === 'done' ? 'accent' : 'ghost'}
            onClick={() => setFilter('done')}
          >
            Done
          </ActionButton>
          <ActionButton
            variant={filter === 'all' ? 'accent' : 'ghost'}
            onClick={() => setFilter('all')}
          >
            All
          </ActionButton>
        </div>
        <div className="flex-1" />
        <ActionButton
          variant="success"
          icon={faPlus}
          onClick={() => setShowCreateModal(true)}
          disabled={teams.length === 0}
        >
          New Issue
        </ActionButton>
        <ActionButton
          variant="accent"
          icon={faRotate}
          onClick={fetchIssues}
          disabled={loading}
        >
          Refresh
        </ActionButton>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          <FontAwesomeIcon icon={faExclamationTriangle} className="mr-2" />
          {error}
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left sidebar - issues list */}
        <div className="w-80 flex flex-col gap-2 overflow-y-auto">
          {loading && issues.length === 0 ? (
            <div className="text-center py-8 text-text-tertiary text-sm">
              Loading issues...
            </div>
          ) : filteredIssues.length === 0 ? (
            <div className="text-center py-8 text-text-tertiary text-sm">
              No issues found
            </div>
          ) : (
            filteredIssues.map(issue => (
              <IssueCard
                key={issue.id}
                issue={issue}
                isSelected={selectedIssue?.id === issue.id}
                onSelect={handleSelectIssue}
              />
            ))
          )}
        </div>

        {/* Right side - issue details */}
        <div className="flex-1 bg-black/20 border border-white/10 rounded-xl overflow-hidden">
          <IssueDetails
            issue={selectedIssue}
            states={currentStates}
            send={send}
            onStatusUpdate={handleStatusUpdate}
            onAssignToGod={handleAssignToGod}
          />
        </div>
      </div>

      {/* Create issue modal */}
      {showCreateModal && (
        <CreateIssueModal
          teams={teams}
          send={send}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleIssueCreated}
        />
      )}
    </div>
  )
}
