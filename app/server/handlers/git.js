/**
 * Git operation handlers.
 */

import { appState, saveState, broadcastState } from '../state.js'
import * as git from '../git.js'

export const handlers = {
  'git:projects:add': (ws, data) => {
    const projectPath = data.path
    if (!projectPath) return

    // Check if already added
    if (appState.gitProjects.some(p => p.path === projectPath)) {
      ws.send(JSON.stringify({ event: 'git:error', error: 'Project already added' }))
      return
    }

    // Verify it's a git repo
    git.isGitRepo(projectPath).then(isRepo => {
      if (!isRepo) {
        ws.send(JSON.stringify({ event: 'git:error', error: 'Not a git repository' }))
        return
      }

      const name = git.getProjectName(projectPath)
      appState.gitProjects.push({ path: projectPath, name })
      saveState()
      broadcastState()
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'git:error', error: err.message }))
    })
  },

  'git:projects:remove': (ws, data) => {
    const projectPath = data.path
    appState.gitProjects = appState.gitProjects.filter(p => p.path !== projectPath)
    saveState()
    broadcastState()
  },

  'git:status': (ws, data) => {
    const projectPath = data.project
    if (!projectPath) return

    git.getStatus(projectPath).then(status => {
      git.getCurrentBranch(projectPath).then(branch => {
        ws.send(JSON.stringify({
          event: 'git:status:response',
          project: projectPath,
          branch,
          ...status
        }))
      })
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'git:error', project: projectPath, error: err.message }))
    })
  },

  'git:diff': (ws, data) => {
    const { project, file, ref1, ref2, staged } = data
    if (!project) return

    const diffFn = staged ? git.getStagedDiff : git.getDiff
    diffFn(project, file || null, ref1 || null, ref2 || null).then(diff => {
      ws.send(JSON.stringify({
        event: 'git:diff:response',
        project,
        file: file || null,
        staged: !!staged,
        diff
      }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'git:error', project, error: err.message }))
    })
  },

  'git:stage': (ws, data) => {
    const { project, files } = data
    if (!project || !files) return

    git.stageFiles(project, files).then(() => {
      return git.getStatus(project)
    }).then(status => {
      ws.send(JSON.stringify({
        event: 'git:status:response',
        project,
        ...status
      }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'git:error', project, error: err.message }))
    })
  },

  'git:unstage': (ws, data) => {
    const { project, files } = data
    if (!project || !files) return

    git.unstageFiles(project, files).then(() => {
      return git.getStatus(project)
    }).then(status => {
      ws.send(JSON.stringify({
        event: 'git:status:response',
        project,
        ...status
      }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'git:error', project, error: err.message }))
    })
  },

  'git:discard': (ws, data) => {
    const { project, files } = data
    if (!project || !files) return

    git.discardChanges(project, files).then(() => {
      return git.getStatus(project)
    }).then(status => {
      ws.send(JSON.stringify({
        event: 'git:status:response',
        project,
        ...status
      }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'git:error', project, error: err.message }))
    })
  },

  'git:commits': (ws, data) => {
    const { project, limit } = data
    if (!project) return

    git.getCommits(project, limit || 50).then(commits => {
      ws.send(JSON.stringify({
        event: 'git:commits:response',
        project,
        commits
      }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'git:error', project, error: err.message }))
    })
  },

  'git:branches': (ws, data) => {
    const { project } = data
    if (!project) return

    Promise.all([
      git.getBranches(project),
      git.getCurrentBranch(project)
    ]).then(([branches, current]) => {
      ws.send(JSON.stringify({
        event: 'git:branches:response',
        project,
        branches,
        current
      }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'git:error', project, error: err.message }))
    })
  },
}
