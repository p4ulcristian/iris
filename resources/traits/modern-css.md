# Modern CSS

Quick reference for modern CSS features that replace JS-heavy solutions.

## Animation
| Feature | Use | Support |
|---------|-----|---------|
| `interpolate-size: allow-keywords` | Animate to `auto`/`min-content` | Chrome 129+ |
| `@starting-style` | Exit animations | Chrome 117+, Safari 17.5+ |
| `animation-timeline: scroll()` | Scroll-linked animation | Chrome 115+ |
| `view-timeline` | Element scroll triggers | Chrome 115+ |

## Layout
| Feature | Use | Support |
|---------|-----|---------|
| `subgrid` | Nested grid alignment | All modern |
| `@container` | Component-level responsive | All modern |
| `:has()` | Parent selector | All modern |

## Visual
| Feature | Use | Support |
|---------|-----|---------|
| `backdrop-filter` | Blur behind element | All modern |
| `color-mix()` | Blend colors | All modern |
| `@property` | Animatable CSS vars | Chrome 85+, Safari 16.4+ |

## Replaces Framer Motion
| JS Pattern | CSS Alternative |
|------------|-----------------|
| `AnimatePresence` | `@starting-style` + `transition-behavior: allow-discrete` |
| Layout animation | `interpolate-size` |
| Scroll animation | `animation-timeline: scroll()` |

## Performance

**Compositor-friendly (fast):**
- `transform`, `opacity` — run on GPU, don't trigger layout
- `filter` — GPU accelerated on most browsers

**Layout-triggering (slow):**
- `width`, `height`, `top`, `left`, `margin`, `padding` — recalculate layout
- Use `transform: translate()` instead of `top/left`

**`backdrop-filter` gotchas:**
- Forces new stacking context + compositing layer
- Expensive when: large area, many overlapping elements, animating
- Causes repaint on every frame if content behind changes
- Fix: minimize blur radius, avoid on scrolling content, use `will-change: transform` to isolate
- Alternative: fake it with pseudo-element + blurred background image

**`box-shadow` vs `filter: drop-shadow()`:**
- `box-shadow` — faster, works on box shape only
- `drop-shadow` — follows alpha mask, more expensive

**Scroll animations:**
- `animation-timeline: scroll()` — runs on compositor, very efficient
- Better than JS `scroll` event listeners

## Performance Hints

Browser hints that don't change visuals, just optimize rendering:

| Property | Use | Effect |
|----------|-----|--------|
| `will-change: transform` | Pre-promote to GPU layer | Faster animation start |
| `contain: layout style paint` | Isolate element | Limits recalc scope |
| `content-visibility: auto` | Skip off-screen paint | Huge savings for hidden content |
| `transform: translateZ(0)` | Force compositing | Ensures GPU path |

**Rules:**
- `will-change` — add before animation, not on everything (memory cost)
- `contain` — safe for isolated components, breaks if children overflow
- `content-visibility` — pair with `contain-intrinsic-size` to prevent layout shift
