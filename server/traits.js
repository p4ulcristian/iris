import fs from 'fs'
import path from 'path'
import os from 'os'
import { TRAITS_DIR } from './config.js'

// User traits directory
const USER_TRAITS_DIR = path.join(os.homedir(), '.config', 'iris', 'traits')

// List all available traits (user + bundled, user takes priority)
export function listTraits() {
  const traits = new Map()

  // Load bundled traits first
  if (TRAITS_DIR && fs.existsSync(TRAITS_DIR)) {
    for (const file of fs.readdirSync(TRAITS_DIR)) {
      if (file.endsWith('.md')) {
        const name = file.replace('.md', '')
        traits.set(name, {
          name,
          path: path.join(TRAITS_DIR, file),
          source: 'bundled'
        })
      }
    }
  }

  // User traits override bundled
  if (fs.existsSync(USER_TRAITS_DIR)) {
    for (const file of fs.readdirSync(USER_TRAITS_DIR)) {
      if (file.endsWith('.md')) {
        const name = file.replace('.md', '')
        traits.set(name, {
          name,
          path: path.join(USER_TRAITS_DIR, file),
          source: 'user'
        })
      }
    }
  }

  return Array.from(traits.values())
}

// Load a trait by name (user version takes priority over bundled)
export function loadTrait(name) {
  if (!name) return null

  // Check user directory first
  const userPath = path.join(USER_TRAITS_DIR, `${name}.md`)
  if (fs.existsSync(userPath)) {
    return fs.readFileSync(userPath, 'utf-8')
  }

  // Fall back to bundled
  if (TRAITS_DIR) {
    const bundledPath = path.join(TRAITS_DIR, `${name}.md`)
    if (fs.existsSync(bundledPath)) {
      return fs.readFileSync(bundledPath, 'utf-8')
    }
  }

  return null
}

// Save a trait to user directory
export function saveTrait(name, content) {
  // Ensure directory exists
  if (!fs.existsSync(USER_TRAITS_DIR)) {
    fs.mkdirSync(USER_TRAITS_DIR, { recursive: true })
  }

  const traitPath = path.join(USER_TRAITS_DIR, `${name}.md`)
  fs.writeFileSync(traitPath, content, 'utf-8')
  return traitPath
}

// Delete a user trait
export function deleteTrait(name) {
  const traitPath = path.join(USER_TRAITS_DIR, `${name}.md`)
  if (fs.existsSync(traitPath)) {
    fs.unlinkSync(traitPath)
    return true
  }
  return false
}

// Get trait info
export function getTraitInfo(name) {
  const traits = listTraits()
  return traits.find(t => t.name === name) || null
}

// Compose multiple traits into a single prompt
// Each trait is separated by a horizontal rule
export function composeTraits(traitNames) {
  if (!traitNames || traitNames.length === 0) {
    return null
  }

  const contents = []
  for (const name of traitNames) {
    const content = loadTrait(name)
    if (content) {
      contents.push(content.trim())
    }
  }

  if (contents.length === 0) {
    return null
  }

  // Join traits with separator
  return contents.join('\n\n---\n\n')
}
