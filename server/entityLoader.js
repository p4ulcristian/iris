/**
 * Entity Loader
 *
 * Scans app/entities/ for entity folders, loads manifests and server modules,
 * and builds a unified entity registry.
 *
 * Each entity folder should contain:
 *   - manifest.json: Entity metadata (type, label, icon, color, category, etc.)
 *   - server.js: Optional server-side handlers (onSpawn, onEvent, onDestroy)
 *   - View.jsx: Frontend component (bundled separately)
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Path to entities folder
const ENTITIES_DIR = path.resolve(__dirname, '../entities')

// Required fields in manifest.json
const REQUIRED_MANIFEST_FIELDS = ['type', 'label']

// Valid categories for sidebar organization
const VALID_CATEGORIES = ['process', 'tools', 'media', 'system']

// Default manifest values
const MANIFEST_DEFAULTS = {
  description: '',
  color: '#888888',
  category: 'tools',
  showInPicker: true,
  showInSidebar: true
}

/**
 * Validates a manifest object
 * @param {object} manifest - The manifest to validate
 * @param {string} entityDir - Path to entity folder (for error messages)
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateManifest(manifest, entityDir) {
  const errors = []

  // Check required fields
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (!manifest[field]) {
      errors.push(`Missing required field: ${field}`)
    }
  }

  // Validate type is a string without spaces
  if (manifest.type && (typeof manifest.type !== 'string' || /\s/.test(manifest.type))) {
    errors.push('Type must be a string without spaces')
  }

  // Validate category if provided
  if (manifest.category && !VALID_CATEGORIES.includes(manifest.category)) {
    errors.push(`Invalid category: ${manifest.category}. Valid categories: ${VALID_CATEGORIES.join(', ')}`)
  }

  // Validate icon - must have either icon (FA icon name) or iconPath (path to image)
  if (!manifest.icon && !manifest.iconPath) {
    // Not an error, just no icon
  }

  // If iconPath is provided, check it exists
  if (manifest.iconPath) {
    const iconFullPath = path.resolve(entityDir, manifest.iconPath)
    if (!fs.existsSync(iconFullPath)) {
      errors.push(`Icon file not found: ${manifest.iconPath}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Loads a single entity from its folder
 * @param {string} entityDir - Path to entity folder
 * @returns {Promise<{ manifest: object, handlers: object } | null>}
 */
async function loadEntity(entityDir) {
  const manifestPath = path.join(entityDir, 'manifest.json')
  const serverPath = path.join(entityDir, 'backend/server.js')
  const folderName = path.basename(entityDir)

  // Check manifest exists
  if (!fs.existsSync(manifestPath)) {
    console.warn(`[EntityLoader] No manifest.json in ${folderName}, skipping`)
    return null
  }

  // Load and parse manifest
  let manifest
  try {
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8')
    manifest = JSON.parse(manifestContent)
  } catch (err) {
    console.error(`[EntityLoader] Failed to parse manifest.json in ${folderName}:`, err.message)
    return null
  }

  // Validate manifest
  const validation = validateManifest(manifest, entityDir)
  if (!validation.valid) {
    console.error(`[EntityLoader] Invalid manifest in ${folderName}:`, validation.errors.join(', '))
    return null
  }

  // Apply defaults
  manifest = { ...MANIFEST_DEFAULTS, ...manifest }

  // Resolve iconPath to absolute path if present
  if (manifest.iconPath) {
    manifest.iconPathAbsolute = path.resolve(entityDir, manifest.iconPath)
  }

  // Load server handlers if present
  let handlers = {}
  if (fs.existsSync(serverPath)) {
    try {
      // Dynamic import for ES modules
      const serverModule = await import(`file://${serverPath}`)
      handlers = {
        type: serverModule.type || manifest.type,
        onSpawn: serverModule.onSpawn || null,
        onEvent: serverModule.onEvent || null,
        onDestroy: serverModule.onDestroy || null
      }
    } catch (err) {
      console.error(`[EntityLoader] Failed to load server.js in ${folderName}:`, err.message)
      // Continue without handlers - not fatal
    }
  }

  return {
    manifest,
    handlers
  }
}

/**
 * Scans the entities directory and loads all entity definitions
 * @returns {Promise<{ registry: object, handlers: object }>}
 */
export async function loadEntities() {
  const registry = {}
  const handlers = {}

  // Check if entities directory exists
  if (!fs.existsSync(ENTITIES_DIR)) {
    console.log('[EntityLoader] No entities directory found, creating it')
    fs.mkdirSync(ENTITIES_DIR, { recursive: true })
    return { registry, handlers }
  }

  // Get all subdirectories
  const entries = fs.readdirSync(ENTITIES_DIR, { withFileTypes: true })
  const entityDirs = entries
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(ENTITIES_DIR, entry.name))

  console.log(`[EntityLoader] Found ${entityDirs.length} entity folders`)

  // Load each entity
  for (const entityDir of entityDirs) {
    const entity = await loadEntity(entityDir)
    if (entity) {
      const type = entity.manifest.type
      registry[type] = entity.manifest
      if (entity.handlers.onSpawn || entity.handlers.onEvent || entity.handlers.onDestroy) {
        handlers[type] = entity.handlers
      }
      console.log(`[EntityLoader] Loaded entity: ${type}`)
    }
  }

  console.log(`[EntityLoader] Loaded ${Object.keys(registry).length} entities`)
  return { registry, handlers }
}

/**
 * Gets the registry object for sending to clients
 * @param {object} registry - The loaded registry
 * @returns {object} - Client-safe registry (without server-only fields)
 */
export function getClientRegistry(registry) {
  const clientRegistry = {}

  for (const [type, manifest] of Object.entries(registry)) {
    // Copy manifest, excluding server-only fields
    const { iconPathAbsolute, ...clientManifest } = manifest
    clientRegistry[type] = clientManifest
  }

  return clientRegistry
}

/**
 * Reloads all entities (for hot reload support)
 * @returns {Promise<{ registry: object, handlers: object }>}
 */
export async function reloadEntities() {
  console.log('[EntityLoader] Reloading entities...')
  return loadEntities()
}

/**
 * Gets a list of entity types by category
 * @param {object} registry - The loaded registry
 * @param {string} category - Category to filter by
 * @returns {object[]} - Array of entity manifests
 */
export function getEntitiesByCategory(registry, category) {
  return Object.values(registry)
    .filter(manifest => manifest.category === category)
    .sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Gets entities that should appear in the picker
 * @param {object} registry - The loaded registry
 * @returns {object[]} - Array of entity manifests
 */
export function getPickerEntities(registry) {
  return Object.values(registry)
    .filter(manifest => manifest.showInPicker !== false)
    .sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Gets entities that should appear in the sidebar
 * @param {object} registry - The loaded registry
 * @returns {object[]} - Array of entity manifests grouped by category
 */
export function getSidebarEntities(registry) {
  const byCategory = {}

  for (const category of VALID_CATEGORIES) {
    byCategory[category] = Object.values(registry)
      .filter(manifest => manifest.category === category && manifest.showInSidebar !== false)
      .sort((a, b) => a.label.localeCompare(b.label))
  }

  return byCategory
}

export { ENTITIES_DIR, VALID_CATEGORIES }
