# Plan: Fix Entity Card Expand/Collapse

## Problems to Fix

1. **Expand button height mismatch** - Button is smaller than other pills (no text, just icon)
2. **Pills row gets clipped** - When text is long, 96px height clips the pills row at the bottom
3. **Animation to 'auto' doesn't work** - Framer Motion can't animate from fixed px to `auto`

---

## Fix Strategy

### Issue 1: Button height mismatch
- Add explicit `h-[22px]` to match pill height (11px font + 2px padding top/bottom + borders)
- Or add `min-h` and `px-2` for consistent sizing

### Issue 2: Pills row clipped
- Restructure layout: use flexbox with fixed header, fixed footer (pills), and flexible middle (text)
- Pills row should be positioned at bottom, always visible
- Text area gets the remaining space and clips with fade

### Issue 3: Animation doesn't work
- Option A: Measure actual content height with a ref, animate to that value
- Option B: Use CSS `max-height` transition instead of Framer Motion height
- Option C: Use `layout` prop with `AnimatePresence` properly

---

## Implementation Steps

### Step 1: Fix card layout structure
- [ ] Use flex column layout for the inner card
- [ ] Header: fixed height (h-8)
- [ ] Content: flex-1 with overflow-hidden and fade mask
- [ ] Pills row: fixed at bottom, always visible

### Step 2: Fix expand button sizing
- [ ] Add explicit height to match other pills (`h-[22px]`)
- [ ] Add horizontal padding for better touch target (`px-2`)

### Step 3: Fix height animation
- [ ] Use a content ref to measure actual expanded height
- [ ] Store measured height in state
- [ ] Animate between 96px and measured height (not 'auto')
- [ ] Re-measure on content changes

### Step 4: Adjust fade mask
- [ ] Only apply fade to the text content area
- [ ] Make fade more subtle (70% visible, 30% fade)

---

## Design Details

### New Card Structure (flex column)
```
┌──────────────────────────────────────┐
│ [Icon] Entity Name             [X]   │  <- Header (h-8, fixed)
├──────────────────────────────────────┤
│ Title/Goal text that might be        │  <- Content area (flex-1)
│ quite long and would normally...     │     - overflow-hidden
│ ░░░░░░░░░░░░ (fade) ░░░░░░░░░░░░░░░░ │     - mask-image fade
├──────────────────────────────────────┤
│ [● done] [⏱ 2m 34s] [▼]              │  <- Pills row (fixed, always visible)
└──────────────────────────────────────┘
   96px collapsed / measured height expanded
```

### Key differences from before:
- Pills row is OUTSIDE the overflow-hidden content area
- Pills row always visible regardless of text length
- Height animation uses measured value, not 'auto'
- Expand button has explicit height to match pills

---

## CSS for Bottom Fade Effect

```css
.entity-card-fade {
  position: relative;
}

.entity-card-fade::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 32px;
  background: linear-gradient(
    to bottom,
    transparent 0%,
    rgba(var(--god-color-rgb), 0.3) 100%
  );
  pointer-events: none;
}
```

Alternative using mask-image (cleaner, blurs actual content):
```css
.entity-card-collapsed-content {
  mask-image: linear-gradient(
    to bottom,
    black 0%,
    black 60%,
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(
    to bottom,
    black 0%,
    black 60%,
    transparent 100%
  );
}
```

---

## Files to Modify

1. **`app/src/components/EntityCard.jsx`**
   - Add expand state and toggle
   - Add fixed height constraint when collapsed
   - Add expand button to header

2. **`app/src/styles/index.css`**
   - Add `.entity-card-fade` or mask styles
   - Add height transition classes if needed

---

## Optional Enhancements (Future)
- [ ] Remember expanded state per entity (persist to layout tree)
- [ ] "Expand all" / "Collapse all" button in sidebar header
- [ ] Double-click card to toggle expand
- [ ] Keyboard shortcut to toggle focused card

---

## Decisions (confirmed)
- **Fixed height:** 96px collapsed
- **Expand button location:** Next to timer pill in the pills row
- **Persist state:** No (resets on refresh)
- **Animation approach:** Measure content height with ref, animate to measured value
