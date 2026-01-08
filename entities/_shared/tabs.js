/**
 * Tab utilities.
 */

import { appState } from '../../server/state.js'
import { REALMS } from '../../server/config.js'

/**
 * Get a random realm name that isn't already in use.
 * @returns {string} A unique realm name
 */
export function getRandomRealmName() {
  const usedNames = new Set(appState.tabs.map(t => t.name))
  const available = REALMS.filter(r => !usedNames.has(r))

  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)]
  }

  // All realms used, add numeral
  let counter = 2
  while (true) {
    const candidate = `${REALMS[Math.floor(Math.random() * REALMS.length)]} ${counter}`
    if (!usedNames.has(candidate)) return candidate
    counter++
  }
}
