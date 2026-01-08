/**
 * Entity Configuration
 *
 * Auto-loads manifests and icons from entities via Vite glob.
 * No build step needed - just add entity folder with manifest.json + icon.
 */

// Auto-import all manifests
const manifestModules = import.meta.glob(
  '../../entities/*/manifest.json',
  { eager: true, import: 'default' }
)

// Auto-import all icons
const iconModules = import.meta.glob(
  '../../entities/*/icon.{svg,png}',
  { eager: true, import: 'default' }
)

// Build icon map: { browser: '/path/to/icon.svg', ... }
const ICON_MAP = Object.fromEntries(
  Object.entries(iconModules).map(([path, src]) => [path.split('/').at(-2), src])
)

// Build entity types from manifests + icons
export const ENTITY_TYPES = Object.fromEntries(
  Object.entries(manifestModules).map(([path, manifest]) => [
    manifest.type,
    { ...manifest, icon: ICON_MAP[manifest.type] || null }
  ])
)

// List format for pickers/iteration
export const ENTITY_TYPE_LIST = Object.entries(ENTITY_TYPES).map(([type, cfg]) => ({ type, ...cfg }))

// Utilities
export const getEntityColor = (type) => ENTITY_TYPES[type]?.color || '#888888'

export const getEntitiesByCategory = (category) =>
  ENTITY_TYPE_LIST.filter(e => e.category === category)

export const getPickerEntities = () =>
  ENTITY_TYPE_LIST.filter(e => e.showInPicker)

export const getSidebarEntities = () => {
  const categories = ['process', 'tools', 'media', 'system']
  const result = {}
  for (const cat of categories) {
    result[cat] = ENTITY_TYPE_LIST.filter(e => e.category === cat && e.showInSidebar)
  }
  return result
}
