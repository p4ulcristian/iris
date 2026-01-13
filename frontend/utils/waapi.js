/**
 * Web Animations API (WAAPI) utilities for React
 *
 * Replaces Framer Motion with native browser APIs.
 * Zero bundle size, compositor-thread performance.
 */

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'

// =============================================================================
// Constants
// =============================================================================

/** Smooth deceleration easing (iOS-like, no overshoot) */
export const SPRING_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

/** Smooth deceleration without overshoot */
export const EASE_OUT = 'cubic-bezier(0.25, 0.1, 0.25, 1)'

/** Default spring animation duration in ms */
export const SPRING_DURATION = 350

/** Fast animation duration for UI feedback */
export const FAST_DURATION = 150

/** Default spring config matching Framer Motion's stiffness=400, damping=25 */
export const SPRING_CONFIG = {
  duration: SPRING_DURATION,
  easing: SPRING_EASING,
  fill: 'forwards'
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Animate an element using WAAPI
 *
 * @param {HTMLElement} element - DOM element to animate
 * @param {Keyframe[]} keyframes - Animation keyframes
 * @param {KeyframeAnimationOptions} options - Animation options
 * @returns {Animation | null} - Animation object for control
 */
export function animate(element, keyframes, options = {}) {
  if (!element) return null

  // Check reduced motion preference
  if (prefersReducedMotion()) {
    // Skip to end state instantly
    return element.animate(keyframes, { ...options, duration: 0 })
  }

  return element.animate(keyframes, {
    duration: SPRING_DURATION,
    easing: SPRING_EASING,
    fill: 'forwards',
    ...options
  })
}

/**
 * Cancel an animation safely
 */
export function cancelAnimation(animation) {
  if (animation) {
    try {
      animation.cancel()
    } catch (e) {
      // Animation may already be finished
    }
  }
}

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

// =============================================================================
// React Hooks
// =============================================================================

/**
 * Hook to check reduced motion preference reactively
 */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e) => setReduced(e.matches)

    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return reduced
}

/**
 * Hook for mount animations
 * Animates element when it first renders
 *
 * @param {Keyframe[]} keyframes - Animation keyframes
 * @param {KeyframeAnimationOptions} options - Animation options
 * @returns {React.RefObject} - Ref to attach to element
 */
export function useMountAnimation(keyframes, options = {}) {
  const ref = useRef(null)
  const animRef = useRef(null)

  useLayoutEffect(() => {
    if (!ref.current) return

    animRef.current = animate(ref.current, keyframes, options)

    return () => cancelAnimation(animRef.current)
  }, []) // Only run on mount

  return ref
}

/**
 * Hook for controlled animations
 * Returns ref and animate function
 *
 * @returns {[React.RefObject, Function]} - [ref, animateFn]
 */
export function useAnimation() {
  const ref = useRef(null)
  const animRef = useRef(null)

  const animateFn = useCallback((keyframes, options = {}) => {
    cancelAnimation(animRef.current)

    if (!ref.current) return null

    animRef.current = animate(ref.current, keyframes, options)
    return animRef.current
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => cancelAnimation(animRef.current)
  }, [])

  return [ref, animateFn]
}

/**
 * Hook for presence animations (enter/exit)
 * Replaces Framer Motion's AnimatePresence
 *
 * @param {boolean} isPresent - Whether element should be visible
 * @param {Object} config - Animation configuration
 * @param {Keyframe[]} config.enter - Enter animation keyframes
 * @param {Keyframe[]} config.exit - Exit animation keyframes
 * @param {number} config.enterDuration - Enter animation duration
 * @param {number} config.exitDuration - Exit animation duration
 * @returns {Object} - { shouldRender, ref, isExiting }
 */
export function usePresence(isPresent, config = {}) {
  const {
    enter = [
      { opacity: 0, transform: 'scale(0.95)' },
      { opacity: 1, transform: 'scale(1)' }
    ],
    exit = [
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(0.95)' }
    ],
    enterDuration = FAST_DURATION,
    exitDuration = FAST_DURATION
  } = config

  const ref = useRef(null)
  const animRef = useRef(null)
  const [shouldRender, setShouldRender] = useState(isPresent)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    if (isPresent) {
      // Enter
      setShouldRender(true)
      setIsExiting(false)
    } else if (shouldRender && !isExiting) {
      // Exit
      setIsExiting(true)

      if (ref.current) {
        cancelAnimation(animRef.current)
        animRef.current = animate(ref.current, exit, {
          duration: exitDuration,
          easing: EASE_OUT
        })

        animRef.current?.finished
          .then(() => {
            setShouldRender(false)
            setIsExiting(false)
          })
          .catch(() => {
            // Animation was cancelled
            setShouldRender(false)
            setIsExiting(false)
          })
      } else {
        setShouldRender(false)
        setIsExiting(false)
      }
    }
  }, [isPresent, shouldRender, isExiting, exit, exitDuration])

  // Enter animation when element mounts
  useLayoutEffect(() => {
    if (shouldRender && !isExiting && ref.current) {
      cancelAnimation(animRef.current)
      animRef.current = animate(ref.current, enter, {
        duration: enterDuration,
        easing: EASE_OUT
      })
    }
  }, [shouldRender, isExiting, enter, enterDuration])

  return { shouldRender, ref, isExiting }
}

/**
 * Hook for staggered animations
 * Animates multiple elements with delays
 *
 * @param {Array} items - Items to animate
 * @param {Object} config - Animation configuration
 * @returns {Object} - { refs, animate }
 */
export function useStagger(items, config = {}) {
  const {
    keyframes = [
      { opacity: 0, transform: 'translateY(-20px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ],
    duration = SPRING_DURATION,
    staggerDelay = 50,
    easing = SPRING_EASING
  } = config

  const refs = useRef({})
  const animations = useRef([])

  const setRef = useCallback((id) => (el) => {
    refs.current[id] = el
  }, [])

  const animateAll = useCallback(() => {
    // Cancel previous animations
    animations.current.forEach(cancelAnimation)
    animations.current = []

    items.forEach((item, i) => {
      const el = refs.current[item.id || i]
      if (el) {
        const anim = animate(el, keyframes, {
          duration,
          delay: i * staggerDelay,
          easing
        })
        if (anim) animations.current.push(anim)
      }
    })
  }, [items, keyframes, duration, staggerDelay, easing])

  // Cleanup
  useEffect(() => {
    return () => animations.current.forEach(cancelAnimation)
  }, [])

  return { setRef, animateAll, refs }
}

/**
 * Hook for value-based animations (like Framer Motion's useMotionValue)
 * Animates a CSS property based on a changing value
 *
 * @param {any} value - Value to animate to
 * @param {string} property - CSS property to animate
 * @param {Object} options - Animation options
 * @returns {React.RefObject} - Ref to attach to element
 */
export function useAnimatedValue(value, property = 'transform', options = {}) {
  const ref = useRef(null)
  const animRef = useRef(null)
  const prevValue = useRef(value)

  useLayoutEffect(() => {
    if (!ref.current || prevValue.current === value) return

    cancelAnimation(animRef.current)

    const keyframes = [
      { [property]: prevValue.current },
      { [property]: value }
    ]

    animRef.current = animate(ref.current, keyframes, options)
    prevValue.current = value
  }, [value, property, options])

  useEffect(() => {
    return () => cancelAnimation(animRef.current)
  }, [])

  return ref
}

// =============================================================================
// Common Animations (Presets)
// =============================================================================

export const ANIMATIONS = {
  fadeIn: [
    { opacity: 0 },
    { opacity: 1 }
  ],
  fadeOut: [
    { opacity: 1 },
    { opacity: 0 }
  ],
  scaleIn: [
    { opacity: 0, transform: 'scale(0.9)' },
    { opacity: 1, transform: 'scale(1)' }
  ],
  scaleOut: [
    { opacity: 1, transform: 'scale(1)' },
    { opacity: 0, transform: 'scale(0.9)' }
  ],
  slideUp: [
    { opacity: 0, transform: 'translateY(20px)' },
    { opacity: 1, transform: 'translateY(0)' }
  ],
  slideDown: [
    { opacity: 0, transform: 'translateY(-20px)' },
    { opacity: 1, transform: 'translateY(0)' }
  ],
  slideLeft: [
    { opacity: 0, transform: 'translateX(20px)' },
    { opacity: 1, transform: 'translateX(0)' }
  ],
  slideRight: [
    { opacity: 0, transform: 'translateX(-20px)' },
    { opacity: 1, transform: 'translateX(0)' }
  ]
}
