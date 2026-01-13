# Web Animations API (WAAPI)

A comprehensive guide to WAAPI for React developers migrating from Framer Motion.

## Why WAAPI

| Feature | CSS | Framer Motion | WAAPI |
|---------|-----|---------------|-------|
| Thread | Compositor | Main | Compositor* |
| Control | Limited | Full | Full |
| Bundle | 0KB | ~40KB | 0KB |
| Promises | No | No | Yes |

*WAAPI runs animations on compositor for transform/opacity

---

## Core API

### element.animate()

```js
const animation = element.animate(keyframes, options)
```

**Keyframes**: Array of states or object with CSS properties

```js
// Array form - explicit states
element.animate([
  { opacity: 0, transform: 'translateY(-20px)' },
  { opacity: 1, transform: 'translateY(0)' }
], options)

// Object form - animate to final state
element.animate(
  { transform: 'translateX(100px)' },
  options
)
```

**Options**:

```js
{
  duration: 300,        // ms
  delay: 0,             // ms
  easing: 'ease-out',   // CSS timing function
  fill: 'forwards',     // Keep final state: 'none' | 'forwards' | 'backwards' | 'both'
  iterations: 1,        // Number or Infinity
  direction: 'normal',  // 'normal' | 'reverse' | 'alternate' | 'alternate-reverse'
}
```

---

## Animation Object

`element.animate()` returns an Animation object:

```js
const anim = element.animate(keyframes, options)

// Control
anim.play()
anim.pause()
anim.cancel()
anim.reverse()
anim.finish()

// State
anim.playState    // 'running' | 'paused' | 'finished' | 'idle'
anim.currentTime  // ms elapsed
anim.playbackRate // 1 = normal, 2 = 2x speed, -1 = reverse

// Promise
anim.finished.then(() => console.log('done'))
```

---

## Timing Functions

### Standard Easings

```js
'linear'
'ease'
'ease-in'
'ease-out'
'ease-in-out'
```

### Cubic Bezier

```js
'cubic-bezier(0.4, 0, 0.2, 1)'  // Material Design standard
'cubic-bezier(0.34, 1.56, 0.64, 1)'  // Spring-like overshoot
```

### Spring Approximation

WAAPI doesn't have native spring physics. Use cubic-bezier curves:

```js
// Snappy spring (recommended)
const SPRING_EASING = 'cubic-bezier(0.34, 1.56, 0.64, 1)'

// Bouncy spring
const BOUNCY_EASING = 'cubic-bezier(0.68, -0.55, 0.27, 1.55)'

// Gentle spring
const GENTLE_EASING = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
```

---

## React Patterns

### Mount Animation

```jsx
import { useLayoutEffect, useRef } from 'react'

function FadeIn({ children }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    if (!ref.current) return

    const anim = ref.current.animate(
      [
        { opacity: 0, transform: 'translateY(-20px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ],
      { duration: 300, easing: 'ease-out', fill: 'forwards' }
    )

    return () => anim.cancel()
  }, [])

  return <div ref={ref} style={{ opacity: 0 }}>{children}</div>
}
```

### Exit Animation (AnimatePresence Replacement)

The hardest pattern to replicate. Requires state management:

```jsx
function usePresence(isPresent, config = {}) {
  const { duration = 150 } = config
  const [shouldRender, setShouldRender] = useState(isPresent)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    if (isPresent) {
      setShouldRender(true)
      setIsExiting(false)
    } else if (shouldRender) {
      setIsExiting(true)
      const timer = setTimeout(() => {
        setShouldRender(false)
        setIsExiting(false)
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [isPresent, shouldRender, duration])

  return [shouldRender, isExiting]
}

// Usage
function Modal({ isOpen, onClose }) {
  const [shouldRender, isExiting] = usePresence(isOpen, { duration: 150 })
  const ref = useRef(null)

  useLayoutEffect(() => {
    if (!ref.current || !shouldRender) return

    ref.current.animate(
      isExiting
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [{ opacity: 0 }, { opacity: 1 }],
      { duration: 150, fill: 'forwards' }
    )
  }, [shouldRender, isExiting])

  if (!shouldRender) return null

  return <div ref={ref}>{/* content */}</div>
}
```

### Stagger Animation

```jsx
function StaggeredList({ items }) {
  const itemRefs = useRef([])

  useLayoutEffect(() => {
    itemRefs.current.forEach((el, i) => {
      if (!el) return
      el.animate(
        [
          { opacity: 0, transform: 'translateY(-20px)' },
          { opacity: 1, transform: 'translateY(0)' }
        ],
        {
          duration: 300,
          delay: i * 50,  // 50ms between each
          easing: 'ease-out',
          fill: 'forwards'
        }
      )
    })
  }, [items])

  return (
    <ul>
      {items.map((item, i) => (
        <li
          key={item.id}
          ref={el => itemRefs.current[i] = el}
          style={{ opacity: 0 }}
        >
          {item.name}
        </li>
      ))}
    </ul>
  )
}
```

### Controlled Animation with State

```jsx
function ExpandCollapse({ isExpanded }) {
  const ref = useRef(null)
  const animRef = useRef(null)

  useEffect(() => {
    if (!ref.current) return

    // Cancel previous animation
    animRef.current?.cancel()

    animRef.current = ref.current.animate(
      { height: isExpanded ? 'auto' : '0px' },
      { duration: 200, easing: 'ease-out', fill: 'forwards' }
    )
  }, [isExpanded])

  return <div ref={ref}>{/* content */}</div>
}
```

---

## Replacing Framer Motion Patterns

### motion.div with animate prop

Before:
```jsx
<motion.div
  initial={{ opacity: 0, y: -20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3 }}
>
```

After:
```jsx
function AnimatedDiv({ children }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    ref.current?.animate(
      [
        { opacity: 0, transform: 'translateY(-20px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ],
      { duration: 300, fill: 'forwards' }
    )
  }, [])

  return <div ref={ref} style={{ opacity: 0 }}>{children}</div>
}
```

### whileHover / whileTap

CSS is usually better:

```css
.button {
  transition: transform 0.2s;
}
.button:hover {
  transform: scale(1.02);
}
.button:active {
  transform: scale(0.98);
}
```

For complex hover animations, use mouseenter/mouseleave:

```jsx
function HoverScale({ children }) {
  const ref = useRef(null)

  return (
    <div
      ref={ref}
      onMouseEnter={() => {
        ref.current?.animate(
          { transform: 'scale(1.05)' },
          { duration: 200, fill: 'forwards' }
        )
      }}
      onMouseLeave={() => {
        ref.current?.animate(
          { transform: 'scale(1)' },
          { duration: 200, fill: 'forwards' }
        )
      }}
    >
      {children}
    </div>
  )
}
```

### layout prop

The `layout` prop does automatic FLIP animation. Replacements:

1. **CSS transitions** (simplest, usually sufficient):
```css
.item {
  transition: transform 0.2s ease-out;
}
```

2. **Manual FLIP** (for complex cases):
```js
function flip(element, callback) {
  // First: capture initial position
  const first = element.getBoundingClientRect()

  // Trigger layout change
  callback()

  // Last: capture final position
  const last = element.getBoundingClientRect()

  // Invert: calculate delta
  const deltaX = first.left - last.left
  const deltaY = first.top - last.top

  // Play: animate from inverted to normal
  element.animate(
    [
      { transform: `translate(${deltaX}px, ${deltaY}px)` },
      { transform: 'translate(0, 0)' }
    ],
    { duration: 200, easing: 'ease-out' }
  )
}
```

### AnimatePresence

See "Exit Animation" pattern above. Key insight: track `shouldRender` and `isExiting` state separately.

### LayoutGroup

Usually not needed. Each component handles its own layout animation via CSS transitions.

---

## Performance Tips

### GPU-Accelerated Properties

These run on compositor thread (fast):
- `transform`
- `opacity`

These trigger layout (slow):
- `width`, `height`
- `top`, `left`, `right`, `bottom`
- `margin`, `padding`

### Use `will-change` Sparingly

```css
.animating {
  will-change: transform;
}
```

Only add before animation, remove after. Constant `will-change` wastes GPU memory.

### Cancel Animations on Unmount

```jsx
useLayoutEffect(() => {
  const anim = ref.current?.animate(...)

  return () => anim?.cancel()  // Cleanup
}, [])
```

### Avoid Layout Thrashing

Bad:
```js
elements.forEach(el => {
  el.style.width = el.offsetWidth + 10 + 'px'  // read + write repeatedly
})
```

Good:
```js
const widths = elements.map(el => el.offsetWidth)  // batch reads
elements.forEach((el, i) => {
  el.style.width = widths[i] + 10 + 'px'  // batch writes
})
```

---

## Utility Library

Create `utils/waapi.js`:

```js
// Constants
export const SPRING_EASING = 'cubic-bezier(0.34, 1.56, 0.64, 1)'
export const SPRING_DURATION = 350
export const FAST_DURATION = 150

// Core animate function with defaults
export function animate(element, keyframes, options = {}) {
  if (!element) return null
  return element.animate(keyframes, {
    duration: SPRING_DURATION,
    easing: SPRING_EASING,
    fill: 'forwards',
    ...options
  })
}

// Accessibility
export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

// Presence hook for exit animations
export function usePresence(isPresent, config = {}) {
  const { duration = FAST_DURATION } = config
  const [shouldRender, setShouldRender] = useState(isPresent)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    if (isPresent) {
      setShouldRender(true)
      setIsExiting(false)
    } else if (shouldRender) {
      setIsExiting(true)
      const timer = setTimeout(() => {
        setShouldRender(false)
        setIsExiting(false)
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [isPresent, shouldRender, duration])

  return [shouldRender, isExiting]
}

// Reduced motion hook
export function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion)

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return

    const handler = (e) => setReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return reduced
}
```

---

## Browser Support

WAAPI is supported in all modern browsers:
- Chrome 36+
- Firefox 48+
- Safari 13.1+
- Edge 79+

No polyfill needed for 2024+ projects.

---

## Quick Reference

| Task | Code |
|------|------|
| Simple animation | `el.animate(keyframes, { duration: 300 })` |
| With spring | `el.animate(kf, { easing: 'cubic-bezier(0.34,1.56,0.64,1)' })` |
| Stagger | `delay: index * 50` |
| On complete | `anim.finished.then(callback)` |
| Cancel | `anim.cancel()` |
| Keep final state | `fill: 'forwards'` |

---

## Further Reading

- [MDN: Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API)
- [MDN: Element.animate()](https://developer.mozilla.org/en-US/docs/Web/API/Element/animate)
- [CSS Easing Functions](https://easings.net)
