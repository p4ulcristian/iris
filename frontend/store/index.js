import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { devtools } from 'zustand/middleware'

/**
 * Iris Store
 *
 * Server state is synced via WebSocket - we don't mutate it locally.
 * Local UI state is managed here for things the server doesn't track.
 */

export const useStore = create(
  devtools(
    immer((set, get) => ({
      // ============================================
      // SERVER STATE (synced via syncState)
      // Do not mutate directly - send WebSocket events
      // ============================================

      tabs: [],
      activeTabId: null,
      tabCounter: 0,
      entities: {},
      focusedEntity: null,
      focusedTile: null,
      theme: 'divine-void',
      godColors: {},
      gitProjects: [],
      cemetery: [],
      settings: {},
      codeHighlights: {},
      entityRegistry: {},
      browserUrl: null,
      tiles: {},
      version: null,
      services: { speak: false, hear: false, chronicle: false },

      // ============================================
      // LOCAL UI STATE (not synced to server)
      // ============================================

      connected: false,
      initialLoadDone: false,
      loadStage: 0,  // 0=loading, 1=shell, 2=structure, 3=surface, 4=entities, 5=ready
      isAltHeld: false,
      layoutMode: 'auto',
      gitBranches: {},  // { [projectPath]: branchName } - fetched per entity
      servicesLoading: { speak: false, hear: false, chronicle: false },
      serviceTargets: {},  // Target state when toggling

      // ============================================
      // SERVER SYNC
      // ============================================

      syncState: (serverState) => set((state) => {
        // Sync all server-managed state
        if (serverState.tabs !== undefined) state.tabs = serverState.tabs
        if (serverState.activeTabId !== undefined) state.activeTabId = serverState.activeTabId
        if (serverState.tabCounter !== undefined) state.tabCounter = serverState.tabCounter
        if (serverState.focusedEntity !== undefined) state.focusedEntity = serverState.focusedEntity
        if (serverState.focusedTile !== undefined) state.focusedTile = serverState.focusedTile
        if (serverState.theme !== undefined) state.theme = serverState.theme
        if (serverState.godColors !== undefined) state.godColors = serverState.godColors
        if (serverState.gitProjects !== undefined) state.gitProjects = serverState.gitProjects
        if (serverState.cemetery !== undefined) state.cemetery = serverState.cemetery
        if (serverState.settings !== undefined) state.settings = serverState.settings
        if (serverState.codeHighlights !== undefined) state.codeHighlights = serverState.codeHighlights
        if (serverState.entityRegistry !== undefined) state.entityRegistry = serverState.entityRegistry
        if (serverState.tiles !== undefined) state.tiles = serverState.tiles
        if (serverState.version !== undefined) state.version = serverState.version

        // Entities come as array, convert to object
        if (serverState.entities) {
          const newEntities = {}
          serverState.entities.forEach(entity => {
            newEntities[entity.id] = entity
          })
          state.entities = newEntities
        }

        // Services status
        if (serverState.services) {
          Object.keys(serverState.services).forEach(key => {
            const target = state.serviceTargets[key]
            if (target !== undefined && serverState.services[key] === target) {
              state.servicesLoading[key] = false
              delete state.serviceTargets[key]
            }
          })
          state.services = { ...state.services, ...serverState.services }
        }
      }),

      // ============================================
      // LOCAL UI ACTIONS
      // ============================================

      setConnected: (connected) => set({ connected }),

      setInitialLoadDone: (done) => set({ initialLoadDone: done }),

      setLoadStage: (stage) => set({ loadStage: stage }),

      triggerStagedReveal: () => {
        const { setLoadStage } = get()
        setLoadStage(1)
        setTimeout(() => setLoadStage(2), 100)
        setTimeout(() => setLoadStage(3), 200)
        setTimeout(() => setLoadStage(4), 300)
        setTimeout(() => setLoadStage(5), 500)
      },

      setAltHeld: (held) => set({ isAltHeld: held }),

      setLayoutMode: (mode) => set({ layoutMode: mode }),

      rotateLayout: () => set((state) => {
        const layouts = ['auto', '1x1', '2x1', '2x2', '3x2', '3x3']
        const idx = layouts.indexOf(state.layoutMode)
        state.layoutMode = layouts[(idx + 1) % layouts.length]
      }),

      setServiceLoading: (service, loading, targetState) => set((state) => {
        state.servicesLoading[service] = loading
        if (loading && targetState !== undefined) {
          state.serviceTargets[service] = targetState
        } else if (!loading) {
          delete state.serviceTargets[service]
        }
      }),

      setGitBranch: (projectPath, branch) => set((state) => {
        state.gitBranches[projectPath] = branch
      }),

      // ============================================
      // SELECTORS (computed from state)
      // ============================================

      getActiveTab: () => {
        const state = get()
        return state.tabs.find(t => t.id === state.activeTabId) || state.tabs[0]
      },

      getActiveEntities: () => {
        const state = get()
        return Object.values(state.entities)
          .filter(e => e.tabId === state.activeTabId)
          .sort((a, b) => (a.order || 0) - (b.order || 0))
      },

      getEntitiesForTab: (tabId) => {
        const state = get()
        return Object.values(state.entities)
          .filter(e => e.tabId === tabId)
          .sort((a, b) => (a.order || 0) - (b.order || 0))
      },

      getAllEntities: () => {
        return Object.values(get().entities)
          .sort((a, b) => (a.order || 0) - (b.order || 0))
      },

      getEntitiesByType: (type) => {
        return Object.values(get().entities)
          .filter(e => e.type === type)
          .sort((a, b) => (a.order || 0) - (b.order || 0))
      },

      // God-specific selectors (gods + terminals)
      getActiveGods: () => {
        const state = get()
        return Object.values(state.entities)
          .filter(e => e.tabId === state.activeTabId && (e.type === 'god' || e.type === 'terminal'))
          .sort((a, b) => (a.order || 0) - (b.order || 0))
      },

      getGodsForTab: (tabId) => {
        return Object.values(get().entities)
          .filter(e => e.tabId === tabId && (e.type === 'god' || e.type === 'terminal'))
          .sort((a, b) => (a.order || 0) - (b.order || 0))
      },

      getAllGods: () => {
        return Object.values(get().entities)
          .filter(e => e.type === 'god' || e.type === 'terminal')
          .sort((a, b) => (a.order || 0) - (b.order || 0))
      },

      getAllGodNames: () => {
        return Object.values(get().entities)
          .filter(e => e.type === 'god')
          .map(e => e.id)
      },

      // Layout selectors
      getActiveStageId: () => {
        const state = get()
        const tab = state.tabs.find(t => t.id === state.activeTabId)
        return tab?.activeStageId || null
      },

      getActiveLayout: () => {
        const state = get()
        const tab = state.tabs.find(t => t.id === state.activeTabId)
        if (!tab) return null
        if (tab.stages && tab.activeStageId) {
          const activeStage = tab.stages.find(s => s.id === tab.activeStageId)
          return activeStage?.layout || null
        }
        return tab?.layout || null
      },

      getLayoutForTab: (tabId) => {
        const state = get()
        const tab = state.tabs.find(t => t.id === tabId)
        if (!tab) return null
        if (tab.stages && tab.activeStageId) {
          const activeStage = tab.stages.find(s => s.id === tab.activeStageId)
          return activeStage?.layout || null
        }
        return tab?.layout || null
      },

      hasMultipleTiles: () => {
        const state = get()
        const tab = state.tabs.find(t => t.id === state.activeTabId)
        if (!tab) return false
        if (tab.stages && tab.activeStageId) {
          const activeStage = tab.stages.find(s => s.id === tab.activeStageId)
          return activeStage?.layout?.type === 'split'
        }
        return tab?.layout?.type === 'split'
      },

      getActiveTiles: () => {
        const state = get()
        return state.tiles[state.activeTabId] || []
      },

      getTilesForTab: (tabId) => {
        return get().tiles[tabId] || []
      },
    })),
    { name: 'iris-store' }
  )
)
