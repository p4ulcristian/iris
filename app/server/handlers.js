import { SERVICES, REALMS } from './config.js'
import { appState, saveState, broadcastState, broadcast, applySettingsToEnv } from './state.js'
import { startService, stopService } from './services.js'
import { createGodSession, createTerminalSession, killGodSession, listGodSockets } from './gods.js'
import { attachPty, detachPty, sendToPty, resizePty, ptyProcesses, getOutputBuffer, clearOutputBuffer } from './pty.js'
import { listSessions } from './history.js'
import * as git from './git.js'
import * as linear from './linear.js'

function getRandomRealmName() {
  const usedNames = new Set(appState.tabs.map(t => t.name))
  const available = REALMS.filter(r => !usedNames.has(r))

  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)]
  }

  // All realms used, add numeral
  let counter = 2
  while (true) {
    const candidate = `${REALMS[Math.floor(Math.random() * REALMS.length)]} ${counter}`
    if (!usedNames.has(candidate)) return candidate
    counter++
  }
}

export function handleMessage(ws, msg, projectRoot) {
  const { event, ...data } = msg

  switch (event) {
    // God lifecycle
    case 'god:spawn': {
      const god = createGodSession(data.name, data.task, projectRoot)
      if (god && !god.exists) {
        const godsInTab = Object.values(appState.gods).filter(g => g.tabId === appState.activeTabId)
        appState.gods[god.name] = {
          tabId: appState.activeTabId,
          order: godsInTab.length,
          mission: god.mission || null,
          spawnedAt: Date.now()
        }
        // Auto-focus new god in focus mode
        if (appState.workLayout === 'focus') {
          appState.focusedGod = god.name
        }
        saveState()
        broadcastState()
      } else if (god?.exists) {
        ws.send(JSON.stringify({ event: 'god:spawned', ...god }))
      }
      break
    }

    case 'terminal:spawn': {
      const terminal = createTerminalSession({
        command: data.command,
        name: data.name,
        color: data.color,
        cwd: data.cwd
      }, projectRoot)
      if (terminal && !terminal.exists) {
        const godsInTab = Object.values(appState.gods).filter(g => g.tabId === appState.activeTabId)
        appState.gods[terminal.name] = {
          tabId: appState.activeTabId,
          order: godsInTab.length,
          spawnedAt: Date.now(),
          displayName: terminal.displayName,
          color: terminal.color
        }
        // Auto-focus new terminal in focus mode
        if (appState.workLayout === 'focus') {
          appState.focusedGod = terminal.name
        }
        saveState()
        broadcastState()
      } else if (terminal?.exists) {
        ws.send(JSON.stringify({ event: 'god:spawned', ...terminal }))
      }
      break
    }

    case 'god:kill': {
      const godName = data.godName || data.name
      if (ptyProcesses.has(godName)) {
        const entry = ptyProcesses.get(godName)
        entry.proc.kill()
        ptyProcesses.delete(godName)
      }
      killGodSession(godName)
      clearOutputBuffer(godName)
      delete appState.gods[godName]
      if (appState.focusedGod === godName) {
        // Find another god in the same tab to focus
        const remainingGods = Object.entries(appState.gods)
          .filter(([_, g]) => g.tabId === appState.activeTabId)
          .sort((a, b) => a[1].order - b[1].order)
        appState.focusedGod = remainingGods.length > 0 ? remainingGods[0][0] : null
      }
      saveState()
      broadcastState()
      break
    }

    case 'god:list': {
      const gods = listGodSockets()
      ws.send(JSON.stringify({ event: 'god:list', gods }))
      break
    }

    case 'god:set-title': {
      const godName = data.godName
      const title = data.title
      if (godName && appState.gods[godName]) {
        appState.gods[godName].title = title
        saveState()
        broadcastState()
      }
      break
    }

    case 'god:set-status': {
      const godName = data.godName
      const status = data.status
      if (godName && appState.gods[godName]) {
        appState.gods[godName].status = status
        saveState()
        broadcastState()
      }
      break
    }

    case 'god:set-ready': {
      const godName = data.godName
      const readyState = data.readyState
      if (godName && appState.gods[godName]) {
        appState.gods[godName].readyState = readyState
        saveState()
        broadcastState()
      }
      break
    }

    case 'god:peek': {
      const godName = data.godName
      const lines = data.lines || 50
      const output = getOutputBuffer(godName, lines)
      ws.send(JSON.stringify({
        event: 'god:peek:response',
        godName,
        output,
        lines: output.split('\n').length
      }))
      break
    }

    case 'service:start': {
      const service = data.service
      if (service && SERVICES[service]) {
        startService(service, projectRoot)
      }
      break
    }

    case 'service:stop': {
      const service = data.service
      if (service && SERVICES[service]) {
        stopService(service)
      }
      break
    }

    // PTY management
    case 'pty:attach': {
      attachPty(data.godName, ws, data.cols, data.rows)
      break
    }

    case 'pty:detach': {
      detachPty(data.godName, ws)
      break
    }

    case 'pty:input': {
      // Reset readyState when user types to a god
      if (appState.gods[data.godName]?.readyState &&
          appState.gods[data.godName].readyState !== 'working') {
        appState.gods[data.godName].readyState = 'working'
        saveState()
        broadcastState()
      }
      sendToPty(data.godName, data.data)
      break
    }

    case 'pty:resize': {
      resizePty(data.godName, data.cols, data.rows)
      break
    }

    // Tab management
    case 'tab:add': {
      appState.tabCounter++
      const newTab = { id: appState.tabCounter, name: data.name || getRandomRealmName() }
      appState.tabs.push(newTab)
      appState.activeTabId = newTab.id
      saveState()
      broadcastState()
      break
    }

    case 'tab:remove': {
      const tabId = data.tabId
      Object.keys(appState.gods).forEach(name => {
        if (appState.gods[name].tabId === tabId) delete appState.gods[name]
      })
      appState.tabs = appState.tabs.filter(t => t.id !== tabId)
      if (appState.tabs.length === 0) {
        appState.tabs = [{ id: 1, name: 'Olympus' }]
        appState.tabCounter = 1
        appState.activeTabId = 1
      } else if (appState.activeTabId === tabId) {
        appState.activeTabId = appState.tabs[0].id
      }
      saveState()
      broadcastState()
      break
    }

    case 'tab:select': {
      appState.activeTabId = data.tabId

      // Ensure focusedGod is in new tab
      const godsInTab = Object.keys(appState.gods)
        .filter(name => appState.gods[name].tabId === data.tabId)
        .sort((a, b) => appState.gods[a].order - appState.gods[b].order)

      if (!godsInTab.includes(appState.focusedGod)) {
        appState.focusedGod = godsInTab[0] || null
      }

      saveState()
      broadcastState()
      break
    }

    case 'tab:rename': {
      const tab = appState.tabs.find(t => t.id === data.tabId)
      if (tab) tab.name = data.name
      saveState()
      broadcastState()
      break
    }

    case 'god:move': {
      if (appState.gods[data.godName]) {
        appState.gods[data.godName].tabId = data.tabId
        const godsInTab = Object.entries(appState.gods)
          .filter(([_, g]) => g.tabId === data.tabId)
          .sort((a, b) => a[1].order - b[1].order)
        godsInTab.forEach(([name, _], idx) => {
          appState.gods[name].order = idx
        })
      }
      saveState()
      broadcastState()
      break
    }

    case 'god:move-to-new-tab': {
      appState.tabCounter++
      const newTab = { id: appState.tabCounter, name: getRandomRealmName() }
      appState.tabs.push(newTab)
      appState.activeTabId = newTab.id
      if (appState.gods[data.godName]) {
        appState.gods[data.godName].tabId = newTab.id
        appState.gods[data.godName].order = 0
      }
      saveState()
      broadcastState()
      break
    }

    case 'theme:set': {
      appState.theme = data.theme
      saveState()
      broadcastState()
      break
    }

    case 'view:set': {
      const validViews = ['work', 'history', 'git', 'browser', 'linear', 'settings']
      if (validViews.includes(data.view)) {
        appState.view = data.view
        saveState()
        broadcastState()
      }
      break
    }

    case 'browser:navigate': {
      const url = data.url
      if (url) {
        // Switch to browser view and set URL
        appState.view = 'browser'
        appState.browserUrl = url
        saveState()
        broadcastState()
      }
      break
    }

    case 'workLayout:set': {
      appState.workLayout = data.layout || 'focus'

      // Get all gods including sockets not yet in appState.gods
      const allGods = listGodSockets()
      allGods.forEach(sock => {
        if (!appState.gods[sock.name]) {
          appState.gods[sock.name] = { tabId: appState.activeTabId, order: 0 }
        }
      })

      // Auto-focus: use provided god, or first god in active tab
      const godsInTab = Object.keys(appState.gods)
        .filter(name => appState.gods[name].tabId === appState.activeTabId)
        .sort((a, b) => (appState.gods[a].order || 0) - (appState.gods[b].order || 0))

      appState.focusedGod = data.focusedGod && godsInTab.includes(data.focusedGod)
        ? data.focusedGod
        : godsInTab[0] || null

      saveState()
      broadcastState()
      break
    }

    case 'focus:set': {
      appState.focusedGod = data.godName || null
      saveState()
      broadcastState()
      break
    }

    case 'gods:reorder': {
      // data.order: array of god names in new order
      const { order } = data
      if (!Array.isArray(order)) break

      // Update order values for each god in the array
      order.forEach((name, idx) => {
        if (appState.gods[name]) {
          appState.gods[name].order = idx
        }
      })

      saveState()
      broadcastState()
      break
    }

    case 'nvim:spawn': {
      const terminal = createTerminalSession({
        command: 'nvim',
        name: data.name,
        color: '#57A143'  // nvim green
      }, projectRoot)
      if (terminal && !terminal.exists) {
        const godsInTab = Object.values(appState.gods).filter(g => g.tabId === appState.activeTabId)
        appState.gods[terminal.name] = {
          tabId: appState.activeTabId,
          order: godsInTab.length,
          spawnedAt: Date.now(),
          displayName: terminal.displayName,
          color: terminal.color
        }
        // Auto-focus new nvim in focus mode
        if (appState.workLayout === 'focus') {
          appState.focusedGod = terminal.name
        }
        saveState()
        broadcastState()
      } else if (terminal?.exists) {
        ws.send(JSON.stringify({ event: 'god:spawned', ...terminal }))
      }
      break
    }

    // History management
    case 'history:list': {
      listSessions(projectRoot, data.limit || 20, data.offset || 0).then(sessions => {
        ws.send(JSON.stringify({ event: 'history:list', sessions }))
      }).catch(err => {
        console.error('Failed to list sessions:', err)
        ws.send(JSON.stringify({ event: 'history:list', sessions: [], error: err.message }))
      })
      break
    }

    case 'history:resume': {
      const god = createGodSession(data.name, '', projectRoot, { resumeSessionId: data.sessionId })
      if (god && !god.exists) {
        const godsInTab = Object.values(appState.gods).filter(g => g.tabId === appState.activeTabId)
        appState.gods[god.name] = {
          tabId: appState.activeTabId,
          order: godsInTab.length,
          mission: data.summary || null,
          spawnedAt: Date.now()
        }
        // Auto-focus resumed god in focus mode
        if (appState.workLayout === 'focus') {
          appState.focusedGod = god.name
        }
        saveState()
        broadcastState()
      } else if (god?.exists) {
        ws.send(JSON.stringify({ event: 'god:spawned', ...god }))
      }
      break
    }

    // Git management
    case 'git:projects:add': {
      const projectPath = data.path
      if (!projectPath) break

      // Check if already added
      if (appState.gitProjects.some(p => p.path === projectPath)) {
        ws.send(JSON.stringify({ event: 'git:error', error: 'Project already added' }))
        break
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
      break
    }

    case 'git:projects:remove': {
      const projectPath = data.path
      appState.gitProjects = appState.gitProjects.filter(p => p.path !== projectPath)
      saveState()
      broadcastState()
      break
    }

    case 'git:status': {
      const projectPath = data.project
      if (!projectPath) break

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
      break
    }

    case 'git:diff': {
      const { project, file, mode, ref1, ref2, staged } = data
      if (!project) break

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
      break
    }

    case 'git:stage': {
      const { project, files } = data
      if (!project || !files) break

      git.stageFiles(project, files).then(() => {
        // Return updated status
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
      break
    }

    case 'git:unstage': {
      const { project, files } = data
      if (!project || !files) break

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
      break
    }

    case 'git:discard': {
      const { project, files } = data
      if (!project || !files) break

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
      break
    }

    case 'git:commits': {
      const { project, limit } = data
      if (!project) break

      git.getCommits(project, limit || 50).then(commits => {
        ws.send(JSON.stringify({
          event: 'git:commits:response',
          project,
          commits
        }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'git:error', project, error: err.message }))
      })
      break
    }

    case 'git:branches': {
      const { project } = data
      if (!project) break

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
      break
    }

    // Linear management
    case 'linear:issues:fetch': {
      if (!linear.isConfigured()) {
        ws.send(JSON.stringify({
          event: 'linear:error',
          error: 'LINEAR_API_KEY not configured. Set the environment variable to use Linear.'
        }))
        break
      }

      linear.getMyIssues(data.limit || 50).then(issues => {
        ws.send(JSON.stringify({
          event: 'linear:issues:response',
          issues
        }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'linear:error', error: err.message }))
      })
      break
    }

    case 'linear:issue:get': {
      const { id } = data
      if (!id) break

      if (!linear.isConfigured()) {
        ws.send(JSON.stringify({
          event: 'linear:error',
          error: 'LINEAR_API_KEY not configured'
        }))
        break
      }

      linear.getIssue(id).then(issue => {
        ws.send(JSON.stringify({
          event: 'linear:issue:response',
          issue
        }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'linear:error', error: err.message }))
      })
      break
    }

    // Settings management
    case 'settings:update': {
      const { key, value } = data
      if (!key) break

      // Initialize settings if needed
      if (!appState.settings) {
        appState.settings = {}
      }

      // Update the setting
      appState.settings[key] = value

      // Apply to environment if it's an API key
      applySettingsToEnv()

      saveState()
      broadcastState()
      break
    }

    // Forward other events to all clients
    default:
      broadcast(event, data)
  }
}
