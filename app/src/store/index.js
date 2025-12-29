import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { devtools } from 'zustand/middleware'

// Initial state
const initialState = {
  // Tabs (with layout tree per tab)
  tabs: [{ id: 1, name: 'Main', layout: null }],
  activeTabId: 1,
  tabCounter: 1,

  // Entities - all types: gods, terminals, browsers, git, etc.
  entities: {},  // { [entityId]: { id, type, name, color, status, tabId, ... } }

  // Services status
  services: {
    speak: false,
    hear: false,
    express: false,
    wake: false,
    ollama: false
  },
  servicesLoading: {
    speak: false,
    hear: false,
    express: false,
    wake: false,
    ollama: false
  },

  // UI state
  focusedEntity: null,
  focusedPane: null,  // For multi-pane layouts
  fullscreenEntity: null,
  layoutMode: 'auto',
  devPanelOpen: false,

  // Synced from server
  theme: 'divine-void',  // Will be overwritten by state:sync
  godColors: {},  // { godName: color } - god palette

  // Connection
  connected: false,
  initialLoadDone: false,

  // Git projects
  gitProjects: [],

  // Cemetery - fallen gods
  cemetery: [],

  // Settings
  settings: {},

  // Code highlights for code viewer
  codeHighlights: {},

  // Browser URL (from skill)
  browserUrl: null,
}

// Store
export const useStore = create(
  devtools(
    immer((set, get) => ({
      ...initialState,

      // ============ TABS ============

      createTab: (name) => set((state) => {
        state.tabCounter++
        const newId = state.tabCounter
        const tabName = (typeof name === 'string' && name) ? name : `Tab ${newId}`
        state.tabs.push({ id: newId, name: tabName })
        state.activeTabId = newId
        state.focusedEntity = null
        state.fullscreenEntity = null
      }),

      closeTab: (tabId) => set((state) => {
        // Get entities in this tab and remove them
        Object.keys(state.entities).forEach(id => {
          if (state.entities[id].tabId === tabId) {
            delete state.entities[id]
          }
        })

        // Remove tab
        state.tabs = state.tabs.filter(t => t.id !== tabId)

        // If no tabs left, create a fresh Main tab
        if (state.tabs.length === 0) {
          state.tabCounter = 1
          state.tabs = [{ id: 1, name: 'Main' }]
          state.activeTabId = 1
        } else if (tabId === state.activeTabId) {
          // Switch to first remaining tab
          state.activeTabId = state.tabs[0].id
        }

        state.focusedEntity = null
        state.fullscreenEntity = null
      }),

      renameTab: (tabId, name) => set((state) => {
        const tab = state.tabs.find(t => t.id === tabId)
        if (tab) tab.name = name
      }),

      switchTab: (tabId) => set((state) => {
        state.activeTabId = tabId
        state.focusedEntity = null
        state.fullscreenEntity = null
      }),

      nextTab: () => set((state) => {
        const idx = state.tabs.findIndex(t => t.id === state.activeTabId)
        const nextIdx = (idx + 1) % state.tabs.length
        state.activeTabId = state.tabs[nextIdx].id
      }),

      prevTab: () => set((state) => {
        const idx = state.tabs.findIndex(t => t.id === state.activeTabId)
        const prevIdx = (idx - 1 + state.tabs.length) % state.tabs.length
        state.activeTabId = state.tabs[prevIdx].id
      }),

      goToTab: (num) => set((state) => {
        if (num >= 1 && num <= state.tabs.length) {
          state.activeTabId = state.tabs[num - 1].id
        }
      }),

      // ============ ENTITIES ============

      addEntity: (entity) => set((state) => {
        const id = entity.id
        // Don't add if already exists
        if (state.entities[id]) return

        state.entities[id] = {
          id,
          type: entity.type || 'god',
          name: entity.name || id,
          color: entity.color || '#888',
          voice: entity.voice,
          status: entity.status || 'working',
          tabId: state.activeTabId,
        }
        state.focusedEntity = id
      }),

      removeEntity: (entityId) => set((state) => {
        const wasFullscreen = state.fullscreenEntity === entityId
        const wasFocused = state.focusedEntity === entityId
        const tabId = state.entities[entityId]?.tabId

        delete state.entities[entityId]

        if (wasFullscreen) state.fullscreenEntity = null
        if (wasFocused) {
          // Auto-select another entity from the same tab
          const remaining = Object.values(state.entities).filter(e => e.tabId === tabId)
          state.focusedEntity = remaining.length > 0 ? remaining[0].id : null
        }
      }),

      updateEntityStatus: (entityId, status) => set((state) => {
        if (state.entities[entityId]) {
          state.entities[entityId].status = status
        }
      }),

      moveEntityToTab: (entityId, tabId) => set((state) => {
        if (state.entities[entityId]) {
          state.entities[entityId].tabId = tabId
        }
      }),

      // ============ UI ============

      setFocusedEntity: (entityId) => set((state) => {
        state.focusedEntity = entityId
      }),

      toggleFullscreen: (entityId) => set((state) => {
        const target = entityId || state.focusedEntity
        if (!target) return
        state.fullscreenEntity = state.fullscreenEntity === target ? null : target
      }),

      setLayoutMode: (mode) => set((state) => {
        state.layoutMode = mode
      }),

      rotateLayout: () => set((state) => {
        const layouts = ['auto', '1x1', '2x1', '2x2', '3x2', '3x3']
        const idx = layouts.indexOf(state.layoutMode)
        state.layoutMode = layouts[(idx + 1) % layouts.length]
      }),

      toggleDevPanel: () => set((state) => {
        state.devPanelOpen = !state.devPanelOpen
      }),

      // ============ CONNECTION ============

      setConnected: (connected) => set((state) => {
        state.connected = connected
      }),

      setInitialLoadDone: (done) => set((state) => {
        state.initialLoadDone = done
      }),

      setServices: (services) => set((state) => {
        state.services = { ...state.services, ...services }
        // Clear loading state when service status changes
        Object.keys(services).forEach(key => {
          state.servicesLoading[key] = false
        })
      }),

      setServiceLoading: (service, loading) => set((state) => {
        state.servicesLoading[service] = loading
      }),

      // ============ SELECTORS (computed) ============

      // Get active tab
      getActiveTab: () => {
        const state = get()
        return state.tabs.find(t => t.id === state.activeTabId) || state.tabs[0]
      },

      // Get entities for active tab (sorted by order)
      getActiveEntities: () => {
        const state = get()
        return Object.values(state.entities)
          .filter(e => e.tabId === state.activeTabId)
          .sort((a, b) => (a.order || 0) - (b.order || 0))
      },

      // Get entities for a specific tab (sorted by order)
      getEntitiesForTab: (tabId) => {
        const state = get()
        return Object.values(state.entities)
          .filter(e => e.tabId === tabId)
          .sort((a, b) => (a.order || 0) - (b.order || 0))
      },

      // Get all entity IDs (for checking what exists)
      getAllEntityIds: () => {
        return Object.keys(get().entities)
      },

      // Get ALL entities across all tabs (for persistent rendering)
      getAllEntities: () => {
        const state = get()
        return Object.values(state.entities)
          .sort((a, b) => (a.order || 0) - (b.order || 0))
      },

      // Get entities by type
      getEntitiesByType: (type) => {
        const state = get()
        return Object.values(state.entities)
          .filter(e => e.type === type)
          .sort((a, b) => (a.order || 0) - (b.order || 0))
      },

      // Get gods (for backwards compatibility and god-specific logic)
      getActiveGods: () => {
        const state = get()
        return Object.values(state.entities)
          .filter(e => e.tabId === state.activeTabId && (e.type === 'god' || e.type === 'terminal'))
          .sort((a, b) => (a.order || 0) - (b.order || 0))
      },

      // Get all god names (for summon modal)
      getAllGodNames: () => {
        return Object.values(get().entities)
          .filter(e => e.type === 'god')
          .map(e => e.id)
      },

      // ============ LAYOUT SELECTORS ============

      // Get layout for active tab
      getActiveLayout: () => {
        const state = get()
        const tab = state.tabs.find(t => t.id === state.activeTabId)
        return tab?.layout || null
      },

      // Get layout for a specific tab
      getLayoutForTab: (tabId) => {
        const state = get()
        const tab = state.tabs.find(t => t.id === tabId)
        return tab?.layout || null
      },

      // Check if current tab has a split layout
      hasMultiplePanes: () => {
        const state = get()
        const tab = state.tabs.find(t => t.id === state.activeTabId)
        return tab?.layout?.type === 'split'
      },

      // ============ SYNC FROM SERVER ============

      syncState: (serverState) => set((state) => {
        // Replace tabs
        state.tabs = serverState.tabs
        state.activeTabId = serverState.activeTabId
        state.tabCounter = serverState.tabCounter

        // Replace entities - build from server data
        const newEntities = {}
        if (serverState.entities) {
          serverState.entities.forEach(entity => {
            newEntities[entity.id] = {
              id: entity.id,
              type: entity.type || 'god',
              name: entity.name || entity.id,
              color: entity.color,
              voice: entity.voice,
              title: entity.title || null,
              status: entity.status || null,
              mission: entity.mission || null,
              readyState: entity.readyState || 'working',
              tabId: entity.tabId,
              order: entity.order,
              spawnedAt: entity.spawnedAt || null,
              // View-specific data
              url: entity.url || null,
              project: entity.project || null,
              pendingFile: entity.pendingFile || null,
              pendingLine: entity.pendingLine || null
            }
          })
        }
        state.entities = newEntities

        // Sync theme and godColors
        if (serverState.theme) {
          state.theme = serverState.theme
        }
        if (serverState.godColors) {
          state.godColors = serverState.godColors
        }

        // Sync focusedEntity and focusedPane from server
        if (serverState.focusedEntity !== undefined) {
          state.focusedEntity = serverState.focusedEntity
        }
        if (serverState.focusedPane !== undefined) {
          state.focusedPane = serverState.focusedPane
        }

        // Sync git projects
        if (serverState.gitProjects !== undefined) {
          state.gitProjects = serverState.gitProjects
        }

        // Sync cemetery
        if (serverState.cemetery !== undefined) {
          state.cemetery = serverState.cemetery
        }

        // Sync settings
        if (serverState.settings !== undefined) {
          state.settings = serverState.settings
        }

        // Sync code highlights
        if (serverState.codeHighlights !== undefined) {
          state.codeHighlights = serverState.codeHighlights
        }

        // Clear fullscreen if entity no longer exists (fullscreen is still client-only)
        if (state.fullscreenEntity && !newEntities[state.fullscreenEntity]) {
          state.fullscreenEntity = null
        }
      }),

      // Add getGodsForTab for backwards compatibility
      getGodsForTab: (tabId) => {
        const state = get()
        return Object.values(state.entities)
          .filter(e => e.tabId === tabId && (e.type === 'god' || e.type === 'terminal'))
          .sort((a, b) => (a.order || 0) - (b.order || 0))
      },

      // Get all gods across all tabs (for persistent terminal rendering)
      getAllGods: () => {
        const state = get()
        return Object.values(state.entities)
          .filter(e => e.type === 'god' || e.type === 'terminal')
          .sort((a, b) => (a.order || 0) - (b.order || 0))
      },
    })),
    { name: 'iris-store' }
  )
)
