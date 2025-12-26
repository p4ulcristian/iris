import { useCallback } from 'react'

/**
 * Wraps a state change in a View Transition for smooth animations.
 * Falls back to immediate update if View Transitions aren't supported.
 */
export function withViewTransition(callback) {
  if (document.startViewTransition) {
    document.startViewTransition(() => {
      callback()
    })
  } else {
    callback()
  }
}

/**
 * Hook that returns a wrapped version of any callback with View Transitions.
 */
export function useViewTransition() {
  const transition = useCallback((callback) => {
    withViewTransition(callback)
  }, [])

  return transition
}
