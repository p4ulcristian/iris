/**
 * Entity Loader
 *
 * Loads entity definitions from entities/entities.json.
 * Array order in the JSON = display order everywhere.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Paths
const ENTITIES_DIR = path.resolve(__dirname, '../entities')
const ENTITIES_JSON = path.join(ENTITIES_DIR, 'entities.json')

// Valid categories
const VALID_CATEGORIES = ['process', 'tools', 'media', 'system']

// Default values for optional fields
const DEFAULTS = {
  description: '',
  color: '#888888',
  category: 'tools'
}

/**
 * Loads all entities from entities.json
 * @returns {Promise<object>} - Entity registry keyed by type, with _order array
 */
export async function loadEntities() {
  const registry = {}

  if (!fs.existsSync(ENTITIES_JSON)) {
    console.error('[EntityLoader] entities/entities.json not found')
    return registry
  }

  let entities
  try {
    const content = fs.readFileSync(ENTITIES_JSON, 'utf-8')
    entities = JSON.parse(content)
  } catch (err) {
    console.error('[EntityLoader] Failed to parse entities.json:', err.message)
    return registry
  }

  if (!Array.isArray(entities)) {
    console.error('[EntityLoader] entities.json must be an array')
    return registry
  }

  // Build registry, preserving order
  const order = []
  for (const entity of entities) {
    if (!entity.type || !entity.label) {
      console.warn('[EntityLoader] Skipping entity without type/label:', entity)
      continue
    }

    if (entity.category && !VALID_CATEGORIES.includes(entity.category)) {
      console.warn(`[EntityLoader] Invalid category "${entity.category}" for ${entity.type}`)
    }

    // Apply defaults
    registry[entity.type] = { ...DEFAULTS, ...entity }
    order.push(entity.type)
  }

  // Store order as special key
  registry._order = order

  console.log(`[EntityLoader] Loaded ${order.length} entities`)
  return registry
}

/**
 * Gets the registry object for sending to clients
 * @param {object} registry - The loaded registry
 * @returns {object} - Client-safe registry
 */
export function getClientRegistry(registry) {
  // Registry is already client-safe, just return it
  return registry
}

/**
 * Reloads all entities
 * @returns {Promise<object>}
 */
export async function reloadEntities() {
  console.log('[EntityLoader] Reloading entities...')
  return loadEntities()
}

/**
 * Gets ordered list of entity types
 * @param {object} registry - The loaded registry
 * @returns {string[]} - Array of entity types in order
 */
export function getEntityOrder(registry) {
  return registry._order || []
}

/**
 * Gets entities by category, in order
 * @param {object} registry - The loaded registry
 * @param {string} category - Category to filter by
 * @returns {object[]} - Array of entity objects
 */
export function getEntitiesByCategory(registry, category) {
  const order = registry._order || []
  return order
    .map(type => registry[type])
    .filter(entity => entity && entity.category === category)
}

/**
 * Gets all entities in order
 * @param {object} registry - The loaded registry
 * @returns {object[]} - Array of entity objects
 */
export function getEntitiesInOrder(registry) {
  const order = registry._order || []
  return order.map(type => registry[type]).filter(Boolean)
}

export { ENTITIES_DIR, VALID_CATEGORIES }
