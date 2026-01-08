/**
 * Entity Renderer
 *
 * Dynamically loads and renders entity View components.
 * Uses Vite glob imports to auto-discover all entity views.
 */

// Auto-import all View components from entities
const viewModules = import.meta.glob(
  '../../entities/*/frontend/View.jsx',
  { eager: true }
)

// Build map: { browser: BrowserView, god: GodView, ... }
const VIEWS = Object.fromEntries(
  Object.entries(viewModules).map(([path, module]) => [
    path.split('/').at(-3), // entities/{type}/frontend/View.jsx → type
    module.default
  ])
)

/**
 * Render an entity's View component
 */
export function renderEntityView(entity, helpers) {
  const View = VIEWS[entity.type]
  if (!View) {
    return (
      <div className="p-4 text-white/50">
        Unknown entity type: {entity.type}
      </div>
    )
  }
  return <View entity={entity} {...helpers} />
}

/**
 * EntityRenderer component
 */
export function EntityRenderer({ entity, ...props }) {
  const View = VIEWS[entity.type]
  if (!View) {
    return (
      <div className="p-4 text-white/50">
        Unknown entity type: {entity.type}
      </div>
    )
  }
  return <View entity={entity} {...props} />
}

export default EntityRenderer
