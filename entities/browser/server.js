/**
 * Browser Entity Server Handlers
 */

export const type = 'browser'

export function onSpawn(data, context) {
  return {
    url: data.url || 'https://google.com'
  }
}

export function onEvent(event, data, context) {
  switch (event) {
    case 'browser:navigate':
      break
  }
}

export function onDestroy(entityId, context) {
  // No cleanup needed
}
