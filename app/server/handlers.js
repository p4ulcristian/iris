import { SERVICES, REALMS } from './config.js'
import { appState, saveState, broadcastState, broadcast } from './state.js'
import { startService, stopService } from './services.js'
import { createGodSession, createTerminalSession, killGodSession, listGodSockets } from './gods.js'
import { attachPty, detachPty, sendToPty, resizePty, ptyProcesses } from './pty.js'
import { listSessions } from './history.js'

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
        if (appState.viewMode === 'focus') {
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
        if (appState.viewMode === 'focus') {
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
      delete appState.gods[godName]
      if (appState.focusedGod === godName) {
        // Find another god in the same tab to focus
        const remainingGods = Object.entries(appState.gods)
          .filter(([_, g]) => g.tabId === appState.activeTabId)
          .sort((a, b) => a[1].order - b[1].order)
        appState.focusedGod = remainingGods.length > 0 ? remainingGods[0][0] : null

        // Exit focus mode if no gods left
        if (!appState.focusedGod && appState.viewMode === 'focus') {
          appState.viewMode = 'grid'
        }
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

    case 'god:status': {
      const godName = data.godName
      const status = data.status
      if (godName && appState.gods[godName]) {
        appState.gods[godName].status = status
        saveState()
        broadcastState()
      }
      break
    }

    case 'god:ready': {
      const godName = data.godName
      const readyState = data.readyState
      if (godName && appState.gods[godName]) {
        appState.gods[godName].readyState = readyState
        saveState()
        broadcastState()
      }
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

      // If in focus mode, ensure focusedGod is in new tab
      if (appState.viewMode === 'focus') {
        const godsInTab = Object.keys(appState.gods)
          .filter(name => appState.gods[name].tabId === data.tabId)
          .sort((a, b) => appState.gods[a].order - appState.gods[b].order)

        if (!godsInTab.includes(appState.focusedGod)) {
          appState.focusedGod = godsInTab[0] || null
        }

        if (!appState.focusedGod) {
          appState.viewMode = 'grid'
        }
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

    case 'viewMode:set': {
      appState.viewMode = data.mode || 'grid'

      if (appState.viewMode === 'focus') {
        // Auto-focus: use provided god, or first god in active tab
        const godsInTab = Object.keys(appState.gods)
          .filter(name => appState.gods[name].tabId === appState.activeTabId)
          .sort((a, b) => appState.gods[a].order - appState.gods[b].order)

        appState.focusedGod = data.focusedGod && godsInTab.includes(data.focusedGod)
          ? data.focusedGod
          : godsInTab[0] || null

        // Can't enter focus mode with no gods - fall back to grid
        if (!appState.focusedGod) {
          appState.viewMode = 'grid'
        }
      } else {
        appState.focusedGod = null
      }

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
        if (appState.viewMode === 'focus') {
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
      listSessions(projectRoot, data.limit || 20).then(sessions => {
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
        if (appState.viewMode === 'focus') {
          appState.focusedGod = god.name
        }
        saveState()
        broadcastState()
      } else if (god?.exists) {
        ws.send(JSON.stringify({ event: 'god:spawned', ...god }))
      }
      break
    }

    // Forward other events to all clients
    default:
      broadcast(event, data)
  }
}
