import fs from 'fs'
import path from 'path'
import os from 'os'
import { PERSONALITIES_DIR } from './config.js'
import { composeTraits, listTraits } from './traits.js'

// User personalities directory
const USER_PERSONALITIES_DIR = path.join(os.homedir(), '.config', 'iris', 'personalities')

// List all available personalities (user + bundled, user takes priority)
// Only trait-based JSON personalities are supported
export function listPersonalities() {
  const personalities = new Map()

  // Helper to add personality from directory
  const addFromDir = (dir, source) => {
    if (!dir || !fs.existsSync(dir)) return

    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith('.json')) {
        const name = file.replace('.json', '')
        try {
          const content = fs.readFileSync(path.join(dir, file), 'utf-8')
          const config = JSON.parse(content)
          personalities.set(name, {
            name,
            path: path.join(dir, file),
            source,
            type: 'traits',
            traits: config.traits || [],
            description: config.description || ''
          })
        } catch (e) {
          console.error(`Failed to parse personality ${file}:`, e.message)
        }
      }
    }
  }

  // Load bundled personalities first
  addFromDir(PERSONALITIES_DIR, 'bundled')

  // User personalities override bundled
  addFromDir(USER_PERSONALITIES_DIR, 'user')

  return Array.from(personalities.values())
}

// Load a personality's config
// Returns { type: 'traits', config: object }
export function loadPersonality(name) {
  if (!name || name === 'none') return null

  // Check user directory first
  const userJsonPath = path.join(USER_PERSONALITIES_DIR, `${name}.json`)
  if (fs.existsSync(userJsonPath)) {
    try {
      const content = fs.readFileSync(userJsonPath, 'utf-8')
      return { type: 'traits', config: JSON.parse(content) }
    } catch (e) {
      console.error(`Failed to parse personality ${name}:`, e.message)
    }
  }

  // Fall back to bundled
  if (PERSONALITIES_DIR) {
    const bundledJsonPath = path.join(PERSONALITIES_DIR, `${name}.json`)
    if (fs.existsSync(bundledJsonPath)) {
      try {
        const content = fs.readFileSync(bundledJsonPath, 'utf-8')
        return { type: 'traits', config: JSON.parse(content) }
      } catch (e) {
        console.error(`Failed to parse personality ${name}:`, e.message)
      }
    }
  }

  return null
}

// Get the composed prompt for a personality (used when spawning gods)
// Composes all enabled traits into a single prompt
export function getComposedPrompt(name) {
  if (!name || name === 'none') return null

  const personality = loadPersonality(name)
  if (!personality) return null

  // Compose all traits
  if (personality.type === 'traits' && personality.config.traits) {
    return composeTraits(personality.config.traits)
  }

  return null
}

// Save a trait-based personality (JSON) to user directory
export function savePersonality(name, config) {
  // Ensure directory exists
  if (!fs.existsSync(USER_PERSONALITIES_DIR)) {
    fs.mkdirSync(USER_PERSONALITIES_DIR, { recursive: true })
  }

  const personalityPath = path.join(USER_PERSONALITIES_DIR, `${name}.json`)
  fs.writeFileSync(personalityPath, JSON.stringify(config, null, 2), 'utf-8')
  return personalityPath
}

// Delete a user personality
export function deletePersonality(name) {
  const jsonPath = path.join(USER_PERSONALITIES_DIR, `${name}.json`)
  if (fs.existsSync(jsonPath)) {
    fs.unlinkSync(jsonPath)
    return true
  }
  return false
}

// Get personality info
export function getPersonalityInfo(name) {
  const personalities = listPersonalities()
  return personalities.find(p => p.name === name) || null
}

// Get all traits for UI display (from traits module)
export { listTraits }
