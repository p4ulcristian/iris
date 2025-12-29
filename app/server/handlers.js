import fs from 'fs'
import path from 'path'
import { SERVICES, REALMS, PANTHEON, LOGS_DIR } from './config.js'
import { appState, saveState, broadcastState, broadcast, applySettingsToEnv, generateEntityId, getNextEntityNumber, normalizeTabOrder, getNextOrder } from './state.js'
import { startService, stopService } from './services.js'
import { createGodSession, createTerminalSession, killGodSession, listGodSockets } from './gods.js'
import { attachPty, detachPty, sendToPty, resizePty, ptyProcesses, getOutputBuffer, clearOutputBuffer } from './pty.js'
import { listSessions } from './history.js'
import * as git from './git.js'
import * as linear from './linear.js'
import * as calendar from './calendar.js'
import * as layout from './layout.js'

// Entity type definitions with display info
const ENTITY_TYPES = {
  god: { icon: '⚡', label: 'God' },
  terminal: { icon: '🖥️', label: 'Terminal' },
  browser: { icon: '🌐', label: 'Browser' },
  code: { icon: '📝', label: 'Code' },
  git: { icon: '⚙️', label: 'Git' },
  history: { icon: '📜', label: 'History' },
  linear: { icon: '✓', label: 'Linear' },
  calendar: { icon: '📅', label: 'Calendar' },
  settings: { icon: '⚙️', label: 'Settings' },
  cemetery: { icon: '🪦', label: 'Cemetery' },
  oracle: { icon: '🔮', label: 'Oracle' }
}

// Add a god to the cemetery before banishing
function addToCemetery(entity) {
  if (entity.type !== 'god') return  // Only gods go to cemetery, not terminals

  const godKey = entity.id.toLowerCase()
  const pantheonGod = PANTHEON[godKey] || { color: '#888', voice: 'emma' }
  const tab = appState.tabs.find(t => t.id === entity.tabId)

  const fallen = {
    id: entity.id,
    name: entity.name || entity.id,
    color: entity.color || pantheonGod.color,
    voice: pantheonGod.voice,
    mission: entity.mission || null,
    title: entity.title || null,
    banishedAt: Date.now(),
    tabName: tab?.name || 'Unknown',
    sessionId: entity.sessionId || null  // Use the entity's tracked session ID
  }

  appState.cemetery.unshift(fallen)  // Add to front (newest first)
}

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
      // If no name provided, pick a random available god from pantheon
      let godName = data.name
      if (!godName) {
        const pantheonNames = Object.keys(PANTHEON)
        const usedNames = new Set(Object.keys(appState.entities).map(n => n.toLowerCase()))
        const available = pantheonNames.filter(n => !usedNames.has(n))
        godName = available.length > 0
          ? available[Math.floor(Math.random() * available.length)]
          : pantheonNames[Math.floor(Math.random() * pantheonNames.length)]
      }
      const god = createGodSession(godName, data.task, projectRoot, {
        startPrompt: appState.settings?.startPrompt,
        userName: appState.settings?.userName
      })
      if (god && !god.exists) {
        appState.entities[god.name] = {
          id: god.name,
          type: 'god',
          name: god.name,
          tabId: appState.activeTabId,
          order: getNextOrder(appState.activeTabId),
          mission: god.mission || null,
          spawnedAt: Date.now(),
          sessionId: god.sessionId || null
        }

        // Add to layout
        const tab = appState.tabs.find(t => t.id === appState.activeTabId)
        if (tab) {
          if (!tab.layout) {
            tab.layout = layout.createPane([god.name], god.name)
          } else {
            const firstPane = layout.getFirstPane(tab.layout)
            if (firstPane) {
              tab.layout = layout.addEntityToPane(tab.layout, firstPane.id, god.name)
            }
          }
          appState.focusedPane = layout.findPaneByEntity(tab.layout, god.name)?.id || null
        }

        appState.focusedEntity = god.name
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
        appState.entities[terminal.name] = {
          id: terminal.name,
          type: 'terminal',
          name: terminal.displayName || terminal.name,
          tabId: appState.activeTabId,
          order: getNextOrder(appState.activeTabId),
          spawnedAt: Date.now(),
          color: terminal.color
        }

        // Add to layout
        const tab = appState.tabs.find(t => t.id === appState.activeTabId)
        if (tab) {
          if (!tab.layout) {
            tab.layout = layout.createPane([terminal.name], terminal.name)
          } else {
            const firstPane = layout.getFirstPane(tab.layout)
            if (firstPane) {
              tab.layout = layout.addEntityToPane(tab.layout, firstPane.id, terminal.name)
            }
          }
          appState.focusedPane = layout.findPaneByEntity(tab.layout, terminal.name)?.id || null
        }

        appState.focusedEntity = terminal.name
        saveState()
        broadcastState()
      } else if (terminal?.exists) {
        ws.send(JSON.stringify({ event: 'god:spawned', ...terminal }))
      }
      break
    }

    case 'god:kill':
    case 'entity:kill': {
      const entityId = data.entityId || data.godName || data.name
      const entity = appState.entities[entityId]
      const entityTabId = entity?.tabId

      // Add god to cemetery before banishing
      if (entity?.type === 'god') {
        addToCemetery(entity)
      }

      // For god/terminal types, clean up PTY
      if (entity?.type === 'god' || entity?.type === 'terminal') {
        if (ptyProcesses.has(entityId)) {
          const entry = ptyProcesses.get(entityId)
          entry.proc.kill()
          ptyProcesses.delete(entityId)
        }
        killGodSession(entityId)
        clearOutputBuffer(entityId)
      }

      delete appState.entities[entityId]

      // Remove from layout (automatically collapses empty panes)
      if (entityTabId) {
        const tab = appState.tabs.find(t => t.id === entityTabId)
        if (tab?.layout) {
          tab.layout = layout.removeEntityFromLayout(tab.layout, entityId)
        }
        normalizeTabOrder(entityTabId)
      }

      if (appState.focusedEntity === entityId) {
        // Find another entity in the same tab to focus
        const remaining = Object.entries(appState.entities)
          .filter(([_, e]) => e.tabId === appState.activeTabId)
          .sort((a, b) => a[1].order - b[1].order)
        appState.focusedEntity = remaining.length > 0 ? remaining[0][0] : null
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

    case 'god:set-title':
    case 'entity:set-title': {
      const entityId = data.entityId || data.godName
      const title = data.title
      if (entityId && appState.entities[entityId]) {
        appState.entities[entityId].title = title
        saveState()
        broadcastState()
      }
      break
    }

    case 'god:set-status':
    case 'entity:set-status': {
      const entityId = data.entityId || data.godName
      const status = data.status
      if (entityId && appState.entities[entityId]) {
        appState.entities[entityId].status = status
        saveState()
        broadcastState()
      }
      break
    }

    case 'god:set-ready':
    case 'entity:set-ready': {
      const entityId = data.entityId || data.godName
      const readyState = data.readyState
      if (entityId && appState.entities[entityId]) {
        appState.entities[entityId].readyState = readyState
        saveState()
        broadcastState()
      }
      break
    }

    case 'god:peek':
    case 'entity:peek': {
      const entityId = data.entityId || data.godName
      const lines = data.lines || 50
      const output = getOutputBuffer(entityId, lines)
      ws.send(JSON.stringify({
        event: 'entity:peek:response',
        entityId,
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
      const entityId = data.entityId || data.godName
      // Reset readyState when user types to an entity
      if (appState.entities[entityId]?.readyState &&
          appState.entities[entityId].readyState !== 'working') {
        appState.entities[entityId].readyState = 'working'
        saveState()
        broadcastState()
      }
      sendToPty(entityId, data.data)
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

      // Remove all entities in this tab (and clean up PTYs for god/terminal types)
      Object.keys(appState.entities).forEach(id => {
        const entity = appState.entities[id]
        if (entity.tabId === tabId) {
          // Add gods to cemetery before banishing
          if (entity.type === 'god') {
            addToCemetery(entity)
          }

          if (entity.type === 'god' || entity.type === 'terminal') {
            if (ptyProcesses.has(id)) {
              const entry = ptyProcesses.get(id)
              entry.proc.kill()
              ptyProcesses.delete(id)
            }
            killGodSession(id)
            clearOutputBuffer(id)
          }
          delete appState.entities[id]
        }
      })

      appState.tabs = appState.tabs.filter(t => t.id !== tabId)
      if (appState.tabs.length === 0) {
        appState.tabs = [{ id: 1, name: 'Olympus' }]
        appState.tabCounter = 1
        appState.activeTabId = 1
      } else if (appState.activeTabId === tabId) {
        appState.activeTabId = appState.tabs[0].id
      }

      // Reset focusedEntity if it was in removed tab
      if (appState.focusedEntity && !appState.entities[appState.focusedEntity]) {
        const remaining = Object.entries(appState.entities)
          .filter(([_, e]) => e.tabId === appState.activeTabId)
          .sort((a, b) => a[1].order - b[1].order)
        appState.focusedEntity = remaining.length > 0 ? remaining[0][0] : null
      }

      saveState()
      broadcastState()
      break
    }

    case 'tab:select': {
      appState.activeTabId = data.tabId

      // Ensure focusedEntity is in new tab
      const entitiesInTab = Object.keys(appState.entities)
        .filter(id => appState.entities[id].tabId === data.tabId)
        .sort((a, b) => appState.entities[a].order - appState.entities[b].order)

      if (!entitiesInTab.includes(appState.focusedEntity)) {
        appState.focusedEntity = entitiesInTab[0] || null
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

    case 'god:move':
    case 'entity:move': {
      const entityId = data.entityId || data.godName
      const entity = appState.entities[entityId]
      if (entity) {
        const sourceTabId = entity.tabId
        const destTabId = data.tabId

        // Move to destination tab with next order
        entity.tabId = destTabId
        entity.order = getNextOrder(destTabId)

        // Normalize both tabs
        normalizeTabOrder(sourceTabId)
        normalizeTabOrder(destTabId)
      }
      saveState()
      broadcastState()
      break
    }

    case 'god:move-to-new-tab':
    case 'entity:move-to-new-tab': {
      const entityId = data.entityId || data.godName
      const entity = appState.entities[entityId]
      const sourceTabId = entity?.tabId

      appState.tabCounter++
      const newTab = { id: appState.tabCounter, name: getRandomRealmName() }
      appState.tabs.push(newTab)
      appState.activeTabId = newTab.id

      if (entity) {
        entity.tabId = newTab.id
        entity.order = 0

        // Normalize source tab after removal
        if (sourceTabId) {
          normalizeTabOrder(sourceTabId)
        }
      }
      appState.focusedEntity = entityId
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

    // Spawn a view entity (browser, git, history, linear, settings)
    case 'entity:spawn': {
      const type = data.type
      if (!ENTITY_TYPES[type] || type === 'god' || type === 'terminal') {
        // Use god:spawn or terminal:spawn for those
        break
      }

      const entityId = generateEntityId(type)
      const num = getNextEntityNumber(type)

      appState.entities[entityId] = {
        id: entityId,
        type,
        name: data.name || `${ENTITY_TYPES[type].label}-${num}`,
        tabId: appState.activeTabId,
        order: getNextOrder(appState.activeTabId),
        spawnedAt: Date.now(),
        // Type-specific data
        url: data.url || null,
        project: data.project || null
      }

      // Add to layout
      const tab = appState.tabs.find(t => t.id === appState.activeTabId)
      if (tab) {
        if (!tab.layout) {
          tab.layout = layout.createPane([entityId], entityId)
        } else {
          const firstPane = layout.getFirstPane(tab.layout)
          if (firstPane) {
            tab.layout = layout.addEntityToPane(tab.layout, firstPane.id, entityId)
          }
        }
        appState.focusedPane = layout.findPaneByEntity(tab.layout, entityId)?.id || null
      }

      appState.focusedEntity = entityId
      saveState()
      broadcastState()
      break
    }

    // Update browser entity URL
    case 'browser:navigate': {
      const entityId = data.entityId
      const url = data.url
      if (entityId && url && appState.entities[entityId]?.type === 'browser') {
        appState.entities[entityId].url = url
        saveState()
        broadcastState()
      }
      break
    }

    case 'focus:set': {
      const entityId = data.entityId || data.godName
      appState.focusedEntity = entityId || null

      // Also update the pane's focusedEntityId in the layout
      if (entityId) {
        const tab = appState.tabs.find(t => t.id === appState.activeTabId)
        if (tab?.layout) {
          const pane = layout.findPaneByEntity(tab.layout, entityId)
          if (pane) {
            tab.layout = layout.setFocusedEntityInPane(tab.layout, pane.id, entityId)
            appState.focusedPane = pane.id
          }
        }
      }

      saveState()
      broadcastState()
      break
    }

    case 'focus:next':
    case 'focus:prev': {
      const entitiesInTab = Object.entries(appState.entities)
        .filter(([_, e]) => e.tabId === appState.activeTabId)
        .sort((a, b) => a[1].order - b[1].order)

      if (entitiesInTab.length === 0) break

      const currentIdx = entitiesInTab.findIndex(([id]) => id === appState.focusedEntity)
      let newIdx

      if (event === 'focus:next') {
        newIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % entitiesInTab.length
      } else {
        newIdx = currentIdx < 0 ? entitiesInTab.length - 1 : (currentIdx - 1 + entitiesInTab.length) % entitiesInTab.length
      }

      const newEntityId = entitiesInTab[newIdx][0]
      appState.focusedEntity = newEntityId

      // Also update the pane's focusedEntityId in the layout
      const tab = appState.tabs.find(t => t.id === appState.activeTabId)
      if (tab?.layout) {
        const pane = layout.findPaneByEntity(tab.layout, newEntityId)
        if (pane) {
          tab.layout = layout.setFocusedEntityInPane(tab.layout, pane.id, newEntityId)
          appState.focusedPane = pane.id
        }
      }

      saveState()
      broadcastState()
      break
    }

    case 'gods:reorder':
    case 'entities:reorder': {
      // data.order: array of entity IDs in new order
      const { order } = data
      if (!Array.isArray(order)) break

      // Update order values for each entity in the array
      order.forEach((id, idx) => {
        if (appState.entities[id]) {
          appState.entities[id].order = idx
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
        appState.entities[terminal.name] = {
          id: terminal.name,
          type: 'terminal',
          name: terminal.displayName || terminal.name,
          tabId: appState.activeTabId,
          order: getNextOrder(appState.activeTabId),
          spawnedAt: Date.now(),
          color: terminal.color
        }
        appState.focusedEntity = terminal.name
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
        appState.entities[god.name] = {
          id: god.name,
          type: 'god',
          name: god.name,
          tabId: appState.activeTabId,
          order: getNextOrder(appState.activeTabId),
          mission: data.summary || null,
          spawnedAt: Date.now()
        }

        // Add to layout
        const tab = appState.tabs.find(t => t.id === appState.activeTabId)
        if (tab) {
          if (!tab.layout) {
            tab.layout = layout.createPane([god.name], god.name)
          } else {
            const firstPane = layout.getFirstPane(tab.layout)
            if (firstPane) {
              tab.layout = layout.addEntityToPane(tab.layout, firstPane.id, god.name)
            }
          }
          appState.focusedPane = layout.findPaneByEntity(tab.layout, god.name)?.id || null
        }

        appState.focusedEntity = god.name
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

    case 'linear:teams:fetch': {
      if (!linear.isConfigured()) {
        ws.send(JSON.stringify({ event: 'linear:error', error: 'LINEAR_API_KEY not configured' }))
        break
      }

      linear.getTeams().then(teams => {
        ws.send(JSON.stringify({ event: 'linear:teams:response', teams }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'linear:error', error: err.message }))
      })
      break
    }

    case 'linear:states:fetch': {
      const { teamId } = data
      if (!teamId) break

      if (!linear.isConfigured()) {
        ws.send(JSON.stringify({ event: 'linear:error', error: 'LINEAR_API_KEY not configured' }))
        break
      }

      linear.getStates(teamId).then(states => {
        ws.send(JSON.stringify({ event: 'linear:states:response', teamId, states }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'linear:error', error: err.message }))
      })
      break
    }

    case 'linear:issue:update-status': {
      const { issueId, stateId } = data
      if (!issueId || !stateId) break

      if (!linear.isConfigured()) {
        ws.send(JSON.stringify({ event: 'linear:error', error: 'LINEAR_API_KEY not configured' }))
        break
      }

      linear.updateIssueStatus(issueId, stateId).then(result => {
        ws.send(JSON.stringify({ event: 'linear:issue:updated', ...result }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'linear:error', error: err.message }))
      })
      break
    }

    case 'linear:issue:create': {
      const { title, teamId, description, priority } = data
      if (!title || !teamId) break

      if (!linear.isConfigured()) {
        ws.send(JSON.stringify({ event: 'linear:error', error: 'LINEAR_API_KEY not configured' }))
        break
      }

      linear.createIssue({ title, teamId, description, priority }).then(result => {
        ws.send(JSON.stringify({ event: 'linear:issue:created', ...result }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'linear:error', error: err.message }))
      })
      break
    }

    case 'linear:comment:create': {
      const { issueId, body } = data
      if (!issueId || !body) break

      if (!linear.isConfigured()) {
        ws.send(JSON.stringify({ event: 'linear:error', error: 'LINEAR_API_KEY not configured' }))
        break
      }

      linear.addComment(issueId, body).then(result => {
        ws.send(JSON.stringify({ event: 'linear:comment:created', issueId, ...result }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'linear:error', error: err.message }))
      })
      break
    }

    // Calendar management
    case 'calendar:status': {
      const info = calendar.getConnectionInfo()
      ws.send(JSON.stringify({ event: 'calendar:status:response', ...info }))
      break
    }

    case 'calendar:auth:start': {
      if (!calendar.isConfigured()) {
        ws.send(JSON.stringify({
          event: 'calendar:error',
          error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'
        }))
        break
      }

      try {
        const authUrl = calendar.getAuthUrl()
        ws.send(JSON.stringify({ event: 'calendar:auth:url', url: authUrl }))
      } catch (err) {
        ws.send(JSON.stringify({ event: 'calendar:error', error: err.message }))
      }
      break
    }

    case 'calendar:auth:callback': {
      const { code } = data
      if (!code) {
        ws.send(JSON.stringify({ event: 'calendar:error', error: 'No authorization code provided' }))
        break
      }

      calendar.handleAuthCallback(code).then(result => {
        ws.send(JSON.stringify({ event: 'calendar:auth:success', ...result }))
        broadcastState()
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'calendar:error', error: err.message }))
      })
      break
    }

    case 'calendar:disconnect': {
      calendar.disconnect()
      ws.send(JSON.stringify({ event: 'calendar:disconnected' }))
      broadcastState()
      break
    }

    case 'calendar:events:fetch': {
      if (!calendar.isConnected()) {
        ws.send(JSON.stringify({
          event: 'calendar:error',
          error: 'Google Calendar not connected. Connect in Settings.'
        }))
        break
      }

      const { timeMin, timeMax, calendarId } = data
      calendar.listEvents(timeMin, timeMax, calendarId).then(events => {
        ws.send(JSON.stringify({ event: 'calendar:events:response', events }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'calendar:error', error: err.message }))
      })
      break
    }

    case 'calendar:event:get': {
      const { eventId, calendarId } = data
      if (!eventId) break

      if (!calendar.isConnected()) {
        ws.send(JSON.stringify({ event: 'calendar:error', error: 'Google Calendar not connected' }))
        break
      }

      calendar.getEvent(eventId, calendarId).then(event => {
        ws.send(JSON.stringify({ event: 'calendar:event:response', calendarEvent: event }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'calendar:error', error: err.message }))
      })
      break
    }

    case 'calendar:event:create': {
      const { summary, start, end, description, location, calendarId } = data
      if (!summary || !start) {
        ws.send(JSON.stringify({ event: 'calendar:error', error: 'Summary and start time required' }))
        break
      }

      if (!calendar.isConnected()) {
        ws.send(JSON.stringify({ event: 'calendar:error', error: 'Google Calendar not connected' }))
        break
      }

      calendar.createEvent({ summary, start, end, description, location }, calendarId).then(event => {
        ws.send(JSON.stringify({ event: 'calendar:event:created', calendarEvent: event }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'calendar:error', error: err.message }))
      })
      break
    }

    case 'calendar:event:update': {
      const { eventId, updates, calendarId } = data
      if (!eventId) break

      if (!calendar.isConnected()) {
        ws.send(JSON.stringify({ event: 'calendar:error', error: 'Google Calendar not connected' }))
        break
      }

      calendar.updateEvent(eventId, updates, calendarId).then(event => {
        ws.send(JSON.stringify({ event: 'calendar:event:updated', calendarEvent: event }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'calendar:error', error: err.message }))
      })
      break
    }

    case 'calendar:event:delete': {
      const { eventId, calendarId } = data
      if (!eventId) break

      if (!calendar.isConnected()) {
        ws.send(JSON.stringify({ event: 'calendar:error', error: 'Google Calendar not connected' }))
        break
      }

      calendar.deleteEvent(eventId, calendarId).then(() => {
        ws.send(JSON.stringify({ event: 'calendar:event:deleted', eventId }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'calendar:error', error: err.message }))
      })
      break
    }

    case 'calendar:calendars:fetch': {
      if (!calendar.isConnected()) {
        ws.send(JSON.stringify({ event: 'calendar:error', error: 'Google Calendar not connected' }))
        break
      }

      calendar.listCalendars().then(calendars => {
        ws.send(JSON.stringify({ event: 'calendar:calendars:response', calendars }))
      }).catch(err => {
        ws.send(JSON.stringify({ event: 'calendar:error', error: err.message }))
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

    // Cemetery management
    case 'cemetery:resurrect': {
      const { godId, sessionId, name, mission, title } = data
      if (!sessionId) break

      // Use the original god name or fall back to provided name
      const godName = godId || name
      if (!godName) break

      // If there's an existing entity with this name, clean it up first
      const existingEntity = appState.entities[godName]
      const existingTabId = existingEntity?.tabId
      if (existingEntity) {
        // Add current god to cemetery before replacing
        if (existingEntity.type === 'god') {
          addToCemetery(existingEntity)
        }
        // Clean up PTY
        if (ptyProcesses.has(godName)) {
          const entry = ptyProcesses.get(godName)
          entry.proc.kill()
          ptyProcesses.delete(godName)
        }
        clearOutputBuffer(godName)
        delete appState.entities[godName]

        // Normalize the tab where the existing entity was removed
        if (existingTabId) {
          normalizeTabOrder(existingTabId)
        }
      }

      // Resume the session with the god's name
      const god = createGodSession(godName, '', projectRoot, { resumeSessionId: sessionId })
      if (god && !god.exists) {
        appState.entities[god.name] = {
          id: god.name,
          type: 'god',
          name: god.name,
          tabId: appState.activeTabId,
          order: getNextOrder(appState.activeTabId),
          spawnedAt: Date.now(),
          mission: mission || null,
          title: title || null,
          sessionId: sessionId  // Preserve sessionId for re-banish
        }

        // Add to layout
        const tab = appState.tabs.find(t => t.id === appState.activeTabId)
        if (tab) {
          if (!tab.layout) {
            tab.layout = layout.createPane([god.name], god.name)
          } else {
            const firstPane = layout.getFirstPane(tab.layout)
            if (firstPane) {
              tab.layout = layout.addEntityToPane(tab.layout, firstPane.id, god.name)
            }
          }
          appState.focusedPane = layout.findPaneByEntity(tab.layout, god.name)?.id || null
        }

        appState.focusedEntity = god.name

        // Remove from cemetery
        appState.cemetery = appState.cemetery.filter(f => f.sessionId !== sessionId)

        saveState()
        broadcastState()
      } else if (god?.exists) {
        ws.send(JSON.stringify({ event: 'god:spawned', ...god }))
      }
      break
    }

    case 'cemetery:remove': {
      const { sessionId } = data
      if (!sessionId) break
      appState.cemetery = appState.cemetery.filter(f => f.sessionId !== sessionId)
      saveState()
      broadcastState()
      break
    }

    case 'cemetery:clear': {
      appState.cemetery = []
      saveState()
      broadcastState()
      break
    }

    // Code viewer management
    case 'code:open': {
      const { filePath, line, entityId } = data
      if (!filePath) break

      // Find or create a code entity
      let codeEntity = entityId ? appState.entities[entityId] : null
      let isNewEntity = false

      if (!codeEntity) {
        // Find first code entity in active tab
        codeEntity = Object.values(appState.entities).find(
          e => e.type === 'code' && e.tabId === appState.activeTabId
        )
      }

      if (!codeEntity) {
        // Create a new code entity
        const newId = generateEntityId('code')
        const num = getNextEntityNumber('code')

        appState.entities[newId] = {
          id: newId,
          type: 'code',
          name: `Code-${num}`,
          tabId: appState.activeTabId,
          order: getNextOrder(appState.activeTabId),
          spawnedAt: Date.now()
        }
        codeEntity = appState.entities[newId]
        isNewEntity = true

        // Add to layout
        const tab = appState.tabs.find(t => t.id === appState.activeTabId)
        if (tab) {
          if (!tab.layout) {
            tab.layout = layout.createPane([newId], newId)
          } else {
            const firstPane = layout.getFirstPane(tab.layout)
            if (firstPane) {
              tab.layout = layout.addEntityToPane(tab.layout, firstPane.id, newId)
            }
          }
          appState.focusedPane = layout.findPaneByEntity(tab.layout, newId)?.id || null
        }
      }

      // Store pending file in entity (for new entities, CodeView will load on mount)
      codeEntity.pendingFile = filePath
      codeEntity.pendingLine = line || 1

      appState.focusedEntity = codeEntity.id
      saveState()
      broadcastState()

      // For existing entities, also broadcast event (CodeView is already mounted)
      if (!isNewEntity) {
        broadcast('code:file:open', {
          entityId: codeEntity.id,
          filePath,
          line: line || 1
        })
      }
      break
    }

    case 'code:highlight': {
      const { filePath, highlights } = data
      if (!filePath || !highlights) break

      // Initialize code highlights in app state if needed
      if (!appState.codeHighlights) {
        appState.codeHighlights = {}
      }

      // Merge new highlights with existing ones
      const existing = appState.codeHighlights[filePath] || []
      appState.codeHighlights[filePath] = [...existing, ...highlights]

      saveState()
      broadcastState()
      break
    }

    case 'code:highlight:clear': {
      const { filePath } = data
      if (!appState.codeHighlights) break

      if (filePath) {
        delete appState.codeHighlights[filePath]
      } else {
        appState.codeHighlights = {}
      }

      saveState()
      broadcastState()
      break
    }

    // Frontend error reporting
    case 'error:report': {
      const { error } = data
      if (!error) break

      // Ensure logs dir exists
      if (!fs.existsSync(LOGS_DIR)) {
        fs.mkdirSync(LOGS_DIR, { recursive: true })
      }

      const logFile = path.join(LOGS_DIR, 'frontend-errors.log')
      const timestamp = new Date().toISOString()
      const logEntry = [
        `[${timestamp}]`,
        `Source: ${error.source || 'unknown'}`,
        `Message: ${error.message || 'No message'}`,
        error.stack ? `Stack: ${error.stack}` : null,
        error.context ? `Context: ${JSON.stringify(error.context)}` : null,
        '---'
      ].filter(Boolean).join('\n') + '\n'

      fs.appendFileSync(logFile, logEntry)
      console.error('[Frontend Error]', error.message, error.source ? `(${error.source})` : '')
      break
    }

    // ============ LAYOUT MANAGEMENT ============

    case 'layout:init': {
      // Initialize layout with first entity (when dropping on empty root)
      const { tabId, entityId, entityType } = data
      const tab = appState.tabs.find(t => t.id === (tabId || appState.activeTabId))
      if (!tab) break

      // Create or get the entity
      let targetEntityId = entityId
      if (entityType && !entityId) {
        // Spawn new entity of this type
        const newId = generateEntityId(entityType)
        const num = getNextEntityNumber(entityType)

        if (entityType === 'god') {
          // For gods, we need to pick a name - use modal instead
          // For now, spawn with a random available god
          const godColors = Object.keys(require('../src/themes/generated/palettes.js').godPalettes || {})
          const usedNames = Object.values(appState.entities).filter(e => e.type === 'god').map(e => e.name?.toLowerCase())
          const availableGods = godColors.filter(g => !usedNames.includes(g))
          const godPool = availableGods.length > 0 ? availableGods : godColors
          const randomGod = godPool[Math.floor(Math.random() * godPool.length)] || 'zeus'
          const godName = randomGod.charAt(0).toUpperCase() + randomGod.slice(1)

          // Trigger god spawn instead
          handleMessage(ws, { event: 'god:spawn', name: godName, task: '' })
          break
        } else if (entityType === 'terminal') {
          handleMessage(ws, { event: 'terminal:spawn' })
          break
        } else {
          // Other entity types
          appState.entities[newId] = {
            id: newId,
            type: entityType,
            name: `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} ${num}`,
            displayName: `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} ${num}`,
            tabId: tab.id,
            color: '#888888',
            spawnedAt: Date.now()
          }
          targetEntityId = newId
        }
      }

      // Create the initial pane with this entity
      if (targetEntityId) {
        tab.layout = layout.createPane([targetEntityId])
        appState.focusedPane = tab.layout.id
        appState.focusedEntity = targetEntityId
      }

      saveState()
      broadcastState()
      break
    }

    case 'layout:split': {
      const { tabId, paneId, direction, position, entityId, entityType } = data
      const tab = appState.tabs.find(t => t.id === (tabId || appState.activeTabId))
      if (!tab) break

      // Initialize layout if null (migration from flat entity list)
      if (!tab.layout) {
        const entityIds = Object.values(appState.entities)
          .filter(e => e.tabId === tab.id)
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map(e => e.id)
        tab.layout = layout.initializeLayoutFromEntities(entityIds)
      }

      // Create or get the entity to place in new pane
      let targetEntityId = entityId
      if (entityType && !entityId) {
        // Spawn new entity of this type
        const newId = generateEntityId(entityType)
        const num = getNextEntityNumber(entityType)

        appState.entities[newId] = {
          id: newId,
          type: entityType,
          name: `${ENTITY_TYPES[entityType]?.label || entityType}-${num}`,
          tabId: tab.id,
          order: getNextOrder(tab.id),
          spawnedAt: Date.now()
        }
        targetEntityId = newId
      }

      // If moving an existing entity, remove it from its current pane first
      // (removeEntityFromLayout automatically collapses empty panes)
      if (entityId && tab.layout) {
        tab.layout = layout.removeEntityFromLayout(tab.layout, entityId)
      }

      // Split the pane (if layout still exists after removal)
      if (tab.layout) {
        tab.layout = layout.splitPane(tab.layout, paneId, direction, position, targetEntityId)
      } else {
        // Layout was fully cleaned - create fresh with just this entity
        tab.layout = layout.createPane([targetEntityId])
      }

      // Focus the new pane and entity
      const newPane = layout.findPaneByEntity(tab.layout, targetEntityId)
      if (newPane) {
        appState.focusedPane = newPane.id
        appState.focusedEntity = targetEntityId
      }

      saveState()
      broadcastState()
      break
    }

    case 'layout:merge': {
      const { tabId, paneId } = data
      const tab = appState.tabs.find(t => t.id === (tabId || appState.activeTabId))
      if (!tab || !tab.layout) break

      const { layout: newLayout, mergedEntityIds } = layout.mergePane(tab.layout, paneId)
      tab.layout = newLayout

      // Update focused pane if it was merged
      if (appState.focusedPane === paneId) {
        const firstPane = layout.getFirstPane(tab.layout)
        appState.focusedPane = firstPane?.id || null
        appState.focusedEntity = firstPane?.focusedEntityId || firstPane?.entityIds?.[0] || null
      }

      saveState()
      broadcastState()
      break
    }

    case 'layout:resize': {
      const { tabId, splitId, ratio } = data
      const tab = appState.tabs.find(t => t.id === (tabId || appState.activeTabId))
      if (!tab || !tab.layout) break

      tab.layout = layout.updateSplitRatio(tab.layout, splitId, ratio)

      saveState()
      broadcastState()
      break
    }

    case 'layout:move-entity': {
      const { entityId, targetPaneId, dropPosition } = data
      const tab = appState.tabs.find(t => t.id === appState.activeTabId)
      if (!tab || !tab.layout || !entityId) break

      if (dropPosition === 'center') {
        // Add to existing pane stack
        tab.layout = layout.moveEntityToPane(tab.layout, entityId, targetPaneId)
      } else {
        // Split the pane
        const direction = (dropPosition === 'left' || dropPosition === 'right') ? 'horizontal' : 'vertical'

        // Remove from current location first
        tab.layout = layout.removeEntityFromLayout(tab.layout, entityId)

        // Split and add to new pane
        tab.layout = layout.splitPane(tab.layout, targetPaneId, direction, dropPosition, entityId)
      }

      // Update focus
      const newPane = layout.findPaneByEntity(tab.layout, entityId)
      if (newPane) {
        appState.focusedPane = newPane.id
        appState.focusedEntity = entityId
      }

      saveState()
      broadcastState()
      break
    }

    case 'pane:focus': {
      const { paneId } = data
      appState.focusedPane = paneId

      // Also update focusedEntity to the pane's focused entity
      const tab = appState.tabs.find(t => t.id === appState.activeTabId)
      if (tab?.layout) {
        const paneResult = layout.findPane(tab.layout, paneId)
        if (paneResult) {
          appState.focusedEntity = paneResult.node.focusedEntityId || paneResult.node.entityIds?.[0] || null
        }
      }

      saveState()
      broadcastState()
      break
    }

    case 'pane:focus-entity': {
      const { paneId, entityId } = data
      const tab = appState.tabs.find(t => t.id === appState.activeTabId)
      if (!tab?.layout) break

      tab.layout = layout.setFocusedEntityInPane(tab.layout, paneId, entityId)
      appState.focusedPane = paneId
      appState.focusedEntity = entityId

      saveState()
      broadcastState()
      break
    }

    case 'layout:add-entity-to-pane': {
      const { paneId, entityId, entityType } = data
      const tab = appState.tabs.find(t => t.id === appState.activeTabId)
      if (!tab) break

      // Initialize layout if needed
      if (!tab.layout) {
        const entityIds = Object.values(appState.entities)
          .filter(e => e.tabId === tab.id)
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map(e => e.id)
        tab.layout = layout.initializeLayoutFromEntities(entityIds)
      }

      // Create entity if type provided
      let targetEntityId = entityId
      if (entityType && !entityId) {
        const newId = generateEntityId(entityType)
        const num = getNextEntityNumber(entityType)

        appState.entities[newId] = {
          id: newId,
          type: entityType,
          name: `${ENTITY_TYPES[entityType]?.label || entityType}-${num}`,
          tabId: tab.id,
          order: getNextOrder(tab.id),
          spawnedAt: Date.now()
        }
        targetEntityId = newId
      } else if (entityId) {
        // Moving existing entity - remove from current pane first
        tab.layout = layout.removeEntityFromLayout(tab.layout, entityId)
      }

      // Add to pane
      tab.layout = layout.addEntityToPane(tab.layout, paneId, targetEntityId)

      appState.focusedPane = paneId
      appState.focusedEntity = targetEntityId

      saveState()
      broadcastState()
      break
    }

    // Forward other events to all clients
    default:
      broadcast(event, data)
  }
}
