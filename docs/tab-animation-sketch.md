# Iris Tab Animation - Horizontal Stack Options

## Option A: Fixed Sidebar (simpler)

Sidebar stays in place. Only the main stage area slides horizontally.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ┌──────────────┐  ┌──────────────────────────────────────────────────────┐ │
│  │              │  │                                                      │ │
│  │   SIDEBAR    │  │  ┌────────┬────────┬════════┬────────┬────────┐     │ │
│  │   (fixed)    │  │  │        │        ║        ║        │        │     │ │
│  │              │  │  │ Tab 0  │ Tab 1  ║ Tab 2  ║ Tab 3  │ Tab 4  │     │ │
│  │  ┌────────┐  │  │  │        │        ║ ACTIVE ║        │        │     │ │
│  │  │ Tab 0  │  │  │  │        │        ║        ║        │        │     │ │
│  │  │ Tab 1  │  │  │  └────────┴────────┴════════┴────────┴────────┘     │ │
│  │  │[Tab 2] │◄─┼──┼───────────────────────┘                              │ │
│  │  │ Tab 3  │  │  │                                                      │ │
│  │  │ Tab 4  │  │  │         ◄── slides horizontally ──►                 │ │
│  │  └────────┘  │  │                                                      │ │
│  │              │  └──────────────────────────────────────────────────────┘ │
│  │  ──────────  │                                                           │
│  │              │  Sidebar shows entities for ACTIVE tab                    │
│  │  Entity      │  Updates instantly when tab changes                       │
│  │  Cards       │                                                           │
│  │  (for Tab 2) │                                                           │
│  │              │                                                           │
│  └──────────────┘                                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

Pros: Simple, familiar
Cons: Sidebar "jumps" to new content (no animation on entity cards)
```

---

## Option B: Sidebar Slides Too (current behavior, but horizontal)

Each tab's entity cards are stacked. Sidebar content slides in sync with main stage.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  ┌────────┬────────┬════════┬────────┬────────┐                     │   │
│  │  │        │        ║        ║        │        │                     │   │
│  │  │ Tab 0  │ Tab 1  ║ Tab 2  ║ Tab 3  │ Tab 4  │   ◄── Main Stage   │   │
│  │  │        │        ║ ACTIVE ║        │        │                     │   │
│  │  │        │        ║        ║        │        │                     │   │
│  │  └────────┴────────┴════════┴────────┴────────┘                     │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  ┌────────┬────────┬════════┬────────┬────────┐                     │   │
│  │  │ Tab 0  │ Tab 1  ║ Tab 2  ║ Tab 3  │ Tab 4  │   ◄── Sidebar      │   │
│  │  │entities│entities║entities║entities│entities│       Entity Cards  │   │
│  │  └────────┴────────┴════════┴────────┴────────┘                     │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Both strips slide together with same spring animation                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

Pros: Smooth, everything animates together
Cons: More DOM elements (entity cards for all tabs always rendered)
```

### Option B Animation Detail

```
SWITCHING Tab 2 → Tab 0
═══════════════════════

MAIN STAGE:
    ┌────────┬────────┬════════┬────────┐
    │ Tab 0  │ Tab 1  ║ Tab 2  ║ Tab 3  │  ════►  slides right
    └────────┴────────┴════════┴────────┘

SIDEBAR ENTITY CARDS:
    ┌────────┬────────┬════════┬────────┐
    │  E0    │  E1    ║  E2    ║  E3    │  ════►  slides right (synced)
    └────────┴────────┴════════┴────────┘

Same spring: { stiffness: 350, damping: 32 }
Both animate with identical timing = feels connected
```

---

## Option C: Sidebar with Internal Horizontal Scroll

Sidebar is fixed, but entity cards section has its own horizontal strip inside.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ┌──────────────┐  ┌──────────────────────────────────────────────────────┐ │
│  │              │  │                                                      │ │
│  │   SIDEBAR    │  │  ┌────────┬────────┬════════┬────────┬────────┐     │ │
│  │              │  │  │        │        ║        ║        │        │     │ │
│  │  ┌────────┐  │  │  │ Tab 0  │ Tab 1  ║ Tab 2  ║ Tab 3  │ Tab 4  │     │ │
│  │  │ Tab 0  │  │  │  │        │        ║ ACTIVE ║        │        │     │ │
│  │  │ Tab 1  │  │  │  │        │        ║        ║        │        │     │ │
│  │  │[Tab 2] │  │  │  └────────┴────────┴════════┴────────┴────────┘     │ │
│  │  │ Tab 3  │  │  │                                                      │ │
│  │  │ Tab 4  │  │  └──────────────────────────────────────────────────────┘ │
│  │  └────────┘  │                                                           │
│  │              │                                                           │
│  │  ──────────  │                                                           │
│  │              │                                                           │
│  │  ┌─────────────────────────────────┐  ◄── Entity cards strip            │
│  │  │ ┌─────┬─────┬═════┬─────┬─────┐ │      (clips to sidebar width)      │
│  │  │ │ E0  │ E1  ║ E2  ║ E3  │ E4  │ │                                    │
│  │  │ └─────┴─────┴═════┴─────┴─────┘ │                                    │
│  │  └─────────────────────────────────┘                                    │
│  │              │                                                           │
│  └──────────────┘                                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

Same animation, but sidebar contains its own clipped horizontal strip.
Tab buttons stay fixed at top of sidebar.
```

---

## Comparison

```
                    Option A          Option B          Option C
                    ─────────         ─────────         ─────────
Sidebar             Fixed             Fixed frame,      Fixed frame,
                                      content slides    content slides

Entity cards        Instant swap      Slides with       Slides inside
                    (no animation)    main stage        sidebar bounds

Tab buttons         Fixed             Fixed             Fixed

Complexity          Simple            Medium            Medium

Feel                Snappy but        Fluid,            Fluid,
                    disconnected      cohesive          contained

DOM overhead        Low               Higher            Higher
                    (only active      (all tabs'        (all tabs'
                    tab entities)     entities)         entities)
```

---

## My Recommendation: Option B

Most cohesive feel. The current Iris already does this vertically - everything slides together. Horizontal is the same principle, just `x` instead of `y`.

```jsx
// Main stage
<motion.div animate={{ x: `${offset * 100}%` }} ... />

// Sidebar entity cards (same animation)
<motion.div animate={{ x: `${offset * 100}%` }} ... />

// Both use same spring = perfect sync
transition={{ type: 'spring', stiffness: 350, damping: 32 }}
```
