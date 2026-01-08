/**
 * Shared entity utilities.
 * Import from here: import { spawnEntity, moveToTab } from '../../entities/_shared'
 */

export {
  createEntityBase,
  addEntity,
  createStageForEntity,
  finalizeSpawn,
  spawnEntity
} from './spawn.js'

export {
  removeFromStage,
  moveToTab,
  moveToNewTab
} from './move.js'

export {
  removeEntity,
  updateFocusAfterKill,
  killEntity
} from './kill.js'

export { addToCemetery } from './cemetery.js'

export { getRandomRealmName } from './tabs.js'
