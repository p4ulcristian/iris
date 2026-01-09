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

    Promise.all([
      git.getStatus(projectPath),
      git.getCurrentBranch(projectPath),
      git.getAheadBehind(projectPath)
    ]).then(([status, branch, aheadBehind]) => {
      ws.send(JSON.stringify({
        event: 'git:status:response',
        project: projectPath,
        branch,
        ahead: aheadBehind.ahead,
        behind: aheadBehind.behind,
        noUpstream: aheadBehind.noUpstream,
        ...status
      }))
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

  'git:commit': (ws, data) => {
    const { project, message, amend } = data
    if (!project || !message) return

    git.commit(project, message, amend).then(() => {
      return git.getStatus(project)
    }).then(status => {
      ws.send(JSON.stringify({
        event: 'git:commit:response',
        project,
        ok: true
      }))
      ws.send(JSON.stringify({
        event: 'git:status:response',
        project,
        ...status
      }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'git:error', project, error: err.message }))
    })
  },

  'git:push': (ws, data) => {
    const { project, remote, branch, force } = data
    if (!project) return

    git.push(project, remote, branch, force).then(() => {
      return git.getAheadBehind(project)
    }).then(aheadBehind => {
      ws.send(JSON.stringify({
        event: 'git:push:response',
        project,
        ok: true,
        ahead: aheadBehind.ahead,
        behind: aheadBehind.behind
      }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'git:error', project, error: err.message }))
    })
  },

  'git:pull': (ws, data) => {
    const { project, remote, branch, rebase } = data
    if (!project) return

    git.pull(project, remote, branch, rebase).then(() => {
      return Promise.all([
        git.getStatus(project),
        git.getAheadBehind(project)
      ])
    }).then(([status, aheadBehind]) => {
      ws.send(JSON.stringify({
        event: 'git:pull:response',
        project,
        ok: true
      }))
      ws.send(JSON.stringify({
        event: 'git:status:response',
        project,
        ahead: aheadBehind.ahead,
        behind: aheadBehind.behind,
        ...status
      }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'git:error', project, error: err.message }))
    })
  },

  'git:fetch': (ws, data) => {
    const { project, remote } = data
    if (!project) return

    git.fetch(project, remote).then(() => {
      return git.getAheadBehind(project)
    }).then(aheadBehind => {
      ws.send(JSON.stringify({
        event: 'git:fetch:response',
        project,
        ok: true,
        ahead: aheadBehind.ahead,
        behind: aheadBehind.behind
      }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'git:error', project, error: err.message }))
    })
  },

  'git:checkout': (ws, data) => {
    const { project, ref } = data
    if (!project || !ref) return

    git.checkout(project, ref).then(() => {
      return Promise.all([
        git.getStatus(project),
        git.getCurrentBranch(project),
        git.getAheadBehind(project)
      ])
    }).then(([status, branch, aheadBehind]) => {
      ws.send(JSON.stringify({
        event: 'git:checkout:response',
        project,
        ok: true,
        branch
      }))
      ws.send(JSON.stringify({
        event: 'git:status:response',
        project,
        branch,
        ahead: aheadBehind.ahead,
        behind: aheadBehind.behind,
        ...status
      }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'git:error', project, error: err.message }))
    })
  },

  'git:branch:create': (ws, data) => {
    const { project, name, startPoint } = data
    if (!project || !name) return

    git.createBranch(project, name, startPoint).then(() => {
      return git.getBranches(project)
    }).then(branches => {
      ws.send(JSON.stringify({
        event: 'git:branch:create:response',
        project,
        ok: true,
        branch: name
      }))
      ws.send(JSON.stringify({
        event: 'git:branches:response',
        project,
        branches,
        current: name
      }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'git:error', project, error: err.message }))
    })
  },

  'git:branch:delete': (ws, data) => {
    const { project, name, force } = data
    if (!project || !name) return

    git.deleteBranch(project, name, force).then(() => {
      return Promise.all([
        git.getBranches(project),
        git.getCurrentBranch(project)
      ])
    }).then(([branches, current]) => {
      ws.send(JSON.stringify({
        event: 'git:branch:delete:response',
        project,
        ok: true
      }))
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

  'git:stash:list': (ws, data) => {
    const { project } = data
    if (!project) return

    git.stashList(project).then(stashes => {
      ws.send(JSON.stringify({
        event: 'git:stash:list:response',
        project,
        stashes
      }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'git:error', project, error: err.message }))
    })
  },

  'git:stash:create': (ws, data) => {
    const { project, message } = data
    if (!project) return

    git.stashCreate(project, message).then(() => {
      return Promise.all([
        git.getStatus(project),
        git.stashList(project)
      ])
    }).then(([status, stashes]) => {
      ws.send(JSON.stringify({
        event: 'git:stash:create:response',
        project,
        ok: true
      }))
      ws.send(JSON.stringify({
        event: 'git:status:response',
        project,
        ...status
      }))
      ws.send(JSON.stringify({
        event: 'git:stash:list:response',
        project,
        stashes
      }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'git:error', project, error: err.message }))
    })
  },

  'git:stash:apply': (ws, data) => {
    const { project, index } = data
    if (!project) return

    git.stashApply(project, index || 0).then(() => {
      return git.getStatus(project)
    }).then(status => {
      ws.send(JSON.stringify({
        event: 'git:stash:apply:response',
        project,
        ok: true
      }))
      ws.send(JSON.stringify({
        event: 'git:status:response',
        project,
        ...status
      }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'git:error', project, error: err.message }))
    })
  },

  'git:stash:pop': (ws, data) => {
    const { project, index } = data
    if (!project) return

    git.stashPop(project, index || 0).then(() => {
      return Promise.all([
        git.getStatus(project),
        git.stashList(project)
      ])
    }).then(([status, stashes]) => {
      ws.send(JSON.stringify({
        event: 'git:stash:pop:response',
        project,
        ok: true
      }))
      ws.send(JSON.stringify({
        event: 'git:status:response',
        project,
        ...status
      }))
      ws.send(JSON.stringify({
        event: 'git:stash:list:response',
        project,
        stashes
      }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'git:error', project, error: err.message }))
    })
  },

  'git:stash:drop': (ws, data) => {
    const { project, index } = data
    if (!project) return

    git.stashDrop(project, index || 0).then(() => {
      return git.stashList(project)
    }).then(stashes => {
      ws.send(JSON.stringify({
        event: 'git:stash:drop:response',
        project,
        ok: true
      }))
      ws.send(JSON.stringify({
        event: 'git:stash:list:response',
        project,
        stashes
      }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'git:error', project, error: err.message }))
    })
  },

  'git:commit:details': (ws, data) => {
    const { project, hash } = data
    if (!project || !hash) return

    git.getCommitDetails(project, hash).then(details => {
      ws.send(JSON.stringify({
        event: 'git:commit:details:response',
        project,
        ...details
      }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'git:error', project, error: err.message }))
    })
  },

  'git:commit:diff': (ws, data) => {
    const { project, hash, file } = data
    if (!project || !hash) return

    git.getCommitDiff(project, hash, file).then(diff => {
      ws.send(JSON.stringify({
        event: 'git:commit:diff:response',
        project,
        hash,
        file: file || null,
        diff
      }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'git:error', project, error: err.message }))
    })
  },

  'git:remotes': (ws, data) => {
    const { project } = data
    if (!project) return

    git.getRemotes(project).then(remotes => {
      ws.send(JSON.stringify({
        event: 'git:remotes:response',
        project,
        remotes
      }))
    }).catch(err => {
      ws.send(JSON.stringify({ event: 'git:error', project, error: err.message }))
    })
  },
}
