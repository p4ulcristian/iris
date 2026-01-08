/**
 * Linear issue management handlers.
 */

import * as linear from '../linear.js'

export const handlers = {
  'linear:issues:fetch': (ws, data) => {
    if (!linear.isConfigured()) {
      ws.send(JSON.stringify({
        event: 'linear:error',
        error: 'LINEAR_API_KEY not configured. Set the environment variable to use Linear.'
      }))
      return
    }

    linear.getMyIssues(data.limit || 50).then(issues => {
      ws.send(JSON.stringify({
        event: 'linear:issues:response',
        issues
      }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'linear:error', error: err.message }))
    })
  },

  'linear:issue:get': (ws, data) => {
    const { id } = data
    if (!id) return

    if (!linear.isConfigured()) {
      ws.send(JSON.stringify({
        event: 'linear:error',
        error: 'LINEAR_API_KEY not configured'
      }))
      return
    }

    linear.getIssue(id).then(issue => {
      ws.send(JSON.stringify({
        event: 'linear:issue:response',
        issue
      }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'linear:error', error: err.message }))
    })
  },

  'linear:teams:fetch': (ws) => {
    if (!linear.isConfigured()) {
      ws.send(JSON.stringify({ event: 'linear:error', error: 'LINEAR_API_KEY not configured' }))
      return
    }

    linear.getTeams().then(teams => {
      ws.send(JSON.stringify({ event: 'linear:teams:response', teams }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'linear:error', error: err.message }))
    })
  },

  'linear:states:fetch': (ws, data) => {
    const { teamId } = data
    if (!teamId) return

    if (!linear.isConfigured()) {
      ws.send(JSON.stringify({ event: 'linear:error', error: 'LINEAR_API_KEY not configured' }))
      return
    }

    linear.getStates(teamId).then(states => {
      ws.send(JSON.stringify({ event: 'linear:states:response', teamId, states }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'linear:error', error: err.message }))
    })
  },

  'linear:issue:update-status': (ws, data) => {
    const { issueId, stateId } = data
    if (!issueId || !stateId) return

    if (!linear.isConfigured()) {
      ws.send(JSON.stringify({ event: 'linear:error', error: 'LINEAR_API_KEY not configured' }))
      return
    }

    linear.updateIssueStatus(issueId, stateId).then(result => {
      ws.send(JSON.stringify({ event: 'linear:issue:updated', ...result }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'linear:error', error: err.message }))
    })
  },

  'linear:issue:create': (ws, data) => {
    const { title, teamId, description, priority } = data
    if (!title || !teamId) return

    if (!linear.isConfigured()) {
      ws.send(JSON.stringify({ event: 'linear:error', error: 'LINEAR_API_KEY not configured' }))
      return
    }

    linear.createIssue({ title, teamId, description, priority }).then(result => {
      ws.send(JSON.stringify({ event: 'linear:issue:created', ...result }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'linear:error', error: err.message }))
    })
  },

  'linear:comment:create': (ws, data) => {
    const { issueId, body } = data
    if (!issueId || !body) return

    if (!linear.isConfigured()) {
      ws.send(JSON.stringify({ event: 'linear:error', error: 'LINEAR_API_KEY not configured' }))
      return
    }

    linear.addComment(issueId, body).then(result => {
      ws.send(JSON.stringify({ event: 'linear:comment:created', issueId, ...result }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'linear:error', error: err.message }))
    })
  },
}
