import { SERVICES } from './config.js'
import { appState, saveState, broadcastState, broadcast } from './state.js'
import { startService, stopService } from './services.js'
import { createGodSession, createTerminalSession, killGodSession, listGodSockets } from './gods.js'
import { attachPty, detachPty, sendToPty, resizePty, ptyProcesses } from './pty.js'

export function handleMessage(ws, msg, projectRoot) {
  const { event, ...data } = msg

  switch (event) {
    // God lifecycle
    case 'god:spawn': {
      const god = createGodSession(data.name, data.task, projectRoot)
      if (god && !god.exists) {
        const godsInTab = Object.values(appState.gods).filter(g => g.tabId === appState.activeTabId)
        appState.gods[god.name] = { tabId: appState.activeTabId, order: godsInTab.length }
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
        appState.gods[terminal.name] = { tabId: appState.activeTabId, order: godsInTab.length }
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
        entry.pty.kill()
        ptyProcesses.delete(godName)
      }
      killGodSession(godName)
      delete appState.gods[godName]
      if (appState.focusedGod === godName) {
        appState.focusedGod = null
        if (appState.viewMode === 'focus') {
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
      const newTab = { id: appState.tabCounter, name: data.name || `Tab ${appState.tabCounter}` }
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
        appState.tabs = [{ id: 1, name: 'Main' }]
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
      const newTab = { id: appState.tabCounter, name: `Tab ${appState.tabCounter}` }
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
      appState.focusedGod = data.focusedGod || null
      if (appState.viewMode === 'grid') {
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

    // Forward other events to all clients
    default:
      broadcast(event, data)
  }
}
