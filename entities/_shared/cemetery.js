/**
 * Cemetery utilities for fallen gods.
 */

import { appState, getBaseGodName } from '../../server/state.js'
import { PANTHEON } from '../../server/config.js'

/**
 * Add a god to the cemetery before banishing.
 * @param {Object} entity - The entity to add to cemetery
 */
export function addToCemetery(entity) {
  if (entity.type !== 'god') return
  if (!entity.sessionId) return

  // Extract base name for PANTHEON lookup (zeus-2 → zeus)
  const baseName = getBaseGodName(entity.id)
  const pantheonGod = PANTHEON[baseName] || { color: '#888', voice: 'emma' }
  const tab = appState.tabs.find(t => t.id === entity.tabId)

  const fallen = {
    id: entity.id,
    name: entity.name || entity.id,
    color: entity.color || pantheonGod.color,
    voice: pantheonGod.voice,
    mission: entity.mission || null,
    title: entity.title || null,
    banishedAt: Date.now(),
    tabName: tab?.name || 'Unknown',
    sessionId: entity.sessionId
  }

  appState.cemetery.unshift(fallen)
}
