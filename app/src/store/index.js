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
    draw: false,
    wake: false,
    ollama: false
  },
  servicesLoading: {
    speak: false,
    hear: false,
    express: false,
    draw: false,
    wake: false,
    ollama: false
  },

  // UI state
  focusedEntity: null,
  focusedTile: null,  // For multi-tile layouts
  layoutMode: 'auto',
  devPanelOpen: false,
  isAltHeld: false,  // For Alt+drag mode

  // Synced from server
  theme: 'divine-void',  // Will be overwritten by state:sync
  godColors: {},  // { godName: color } - god palette

  // Connection
  connected: false,
  initialLoadDone: false,

  // Staged loading animation (0=loading, 1=shell, 2=structure, 3=surface, 4=entities, 5=ready)
  loadStage: 0,

  // Git projects
  gitProjects: [],

  // Git branches by project path - { [projectPath]: branchName }
  gitBranches: {},

  // Cemetery - fallen gods
  cemetery: [],

  // Settings
  settings: {},

  // Code highlights for code viewer
  codeHighlights: {},

  // Entity registry from server (type definitions)
  entityRegistry: {},

  // Browser URL (from skill)
  browserUrl: null,

  // Tiles per tab - extracted from layout tree by server
  tiles: {},  // { [tabId]: [{ id, entityId }, ...] } - one entity per tile

  // App version (from server)
  version: null
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
      }),

      renameTab: (tabId, name) => set((state) => {
        const tab = state.tabs.find(t => t.id === tabId)
        if (tab) tab.name = name
      }),

      switchTab: (tabId) => set((state) => {
        state.activeTabId = tabId
        state.focusedEntity = null
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

      // Add optimistic entity while spawning (will be replaced by server state)
      addSpawningEntity: (entity) => set((state) => {
        const id = entity.id
        // Don't add if already exists
        if (state.entities[id]) return

        state.entities[id] = {
          id,
          type: entity.type || 'god',
          name: entity.name || id,
          color: entity.color || '#888',
          voice: entity.voice,
          status: null,
          readyState: 'spawning',
          tabId: state.activeTabId,
          order: entity.order || 0,
          spawnedAt: Date.now(),
          mission: entity.mission || null,
        }

        // Also add optimistic stage so entity appears in sidebar
        const tab = state.tabs.find(t => t.id === state.activeTabId)
        if (tab) {
          const stageId = `spawning-${id}-${Date.now()}`
          const tileId = `tile-spawning-${id}-${Date.now()}`
          const newStage = {
            id: stageId,
            layout: {
              type: 'tile',
              id: tileId,
              entityId: id
            }
          }
          if (!tab.stages) tab.stages = []
          tab.stages.push(newStage)
          tab.activeStageId = stageId
          state.focusedTile = tileId
        }

        state.focusedEntity = id
      }),

      removeEntity: (entityId) => set((state) => {
        const wasFocused = state.focusedEntity === entityId
        const tabId = state.entities[entityId]?.tabId

        delete state.entities[entityId]

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

      setAltHeld: (held) => set((state) => {
        state.isAltHeld = held
      }),

      // ============ CONNECTION ============

      setConnected: (connected) => set((state) => {
        state.connected = connected
      }),

      setInitialLoadDone: (done) => set((state) => {
        state.initialLoadDone = done
      }),

      setLoadStage: (stage) => set((state) => {
        state.loadStage = stage
      }),

      // Trigger staged reveal animation
      triggerStagedReveal: () => {
        const { setLoadStage } = get()
        // Stage 1: Shell (immediate)
        setLoadStage(1)
        // Stage 2: Structure (tabs)
        setTimeout(() => setLoadStage(2), 100)
        // Stage 3: Surface
        setTimeout(() => setLoadStage(3), 200)
        // Stage 4: Entities
        setTimeout(() => setLoadStage(4), 300)
        // Stage 5: Ready (all polish)
        setTimeout(() => setLoadStage(5), 500)
      },

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

      // Git branches
      setGitBranch: (projectPath, branch) => set((state) => {
        state.gitBranches[projectPath] = branch
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

      // Get active stage ID for current tab
      getActiveStageId: () => {
        const state = get()
        const tab = state.tabs.find(t => t.id === state.activeTabId)
        return tab?.activeStageId || null
      },

      // Get layout for active stage in active tab
      getActiveLayout: () => {
        const state = get()
        const tab = state.tabs.find(t => t.id === state.activeTabId)
        if (!tab) return null
        // New stages format: get active stage's layout
        if (tab.stages && tab.activeStageId) {
          const activeStage = tab.stages.find(s => s.id === tab.activeStageId)
          return activeStage?.layout || null
        }
        // Legacy fallback
        return tab?.layout || null
      },

      // Get layout for a specific tab's active stage
      getLayoutForTab: (tabId) => {
        const state = get()
        const tab = state.tabs.find(t => t.id === tabId)
        if (!tab) return null
        // New stages format
        if (tab.stages && tab.activeStageId) {
          const activeStage = tab.stages.find(s => s.id === tab.activeStageId)
          return activeStage?.layout || null
        }
        // Legacy fallback
        return tab?.layout || null
      },

      // Check if current tab's active stage has a split layout
      hasMultipleTiles: () => {
        const state = get()
        const tab = state.tabs.find(t => t.id === state.activeTabId)
        if (!tab) return false
        // New stages format
        if (tab.stages && tab.activeStageId) {
          const activeStage = tab.stages.find(s => s.id === tab.activeStageId)
          return activeStage?.layout?.type === 'split'
        }
        // Legacy fallback
        return tab?.layout?.type === 'split'
      },

      // Get tiles for active tab
      getActiveTiles: () => {
        const state = get()
        return state.tiles[state.activeTabId] || []
      },

      // Get tiles for a specific tab
      getTilesForTab: (tabId) => {
        const state = get()
        return state.tiles[tabId] || []
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
              pendingLine: entity.pendingLine || null,
              data: entity.data || null
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

        // Sync focusedEntity and focusedTile from server
        if (serverState.focusedEntity !== undefined) {
          state.focusedEntity = serverState.focusedEntity
        }
        if (serverState.focusedTile !== undefined) {
          state.focusedTile = serverState.focusedTile
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

        // Sync entity registry
        if (serverState.entityRegistry !== undefined) {
          state.entityRegistry = serverState.entityRegistry
        }

        // Sync tiles
        if (serverState.tiles !== undefined) {
          state.tiles = serverState.tiles
        }

        // Sync version
        if (serverState.version !== undefined) {
          state.version = serverState.version
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
