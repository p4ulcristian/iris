# Plan: Alt Key Shortcuts Popup

## Overview
Show a centered popup displaying all keyboard shortcuts when the Alt key is held down. The popup disappears immediately when Alt is released.

## Implementation Steps

### 1. Create `ShortcutsPopup.jsx` Component
**Location:** `/home/p4ulcristian/Work/iris/app/src/components/ShortcutsPopup.jsx`

```jsx
// Props: isOpen (boolean)
// Uses liquid-glass-modal styling
// Centered on screen with fixed positioning
// Displays shortcuts in organized sections:
//   - Navigation (tabs, entities)
//   - Actions (summon, kill, etc.)
//   - Window controls
```

**Shortcut Categories:**
| Section | Shortcuts |
|---------|-----------|
| **Tabs** | Alt+T (new), Alt+W (close), Alt+1-9 (go to), Alt+←/→ or Alt+,/. (prev/next) |
| **Entities** | Alt+N (summon), Alt+K (kill), Alt+R (raw terminal), Alt+↑/↓ (focus) |
| **Window** | Alt+F (fullscreen), Alt+B (sidebar), Alt+D (dev panel) |
| **General** | Escape (clear focus) |

### 2. Add State to Track Alt Key Hold
**Location:** `/home/p4ulcristian/Work/iris/app/src/App.jsx`

- Add `showShortcuts` state (or use existing `isAltHeld` from store)
- Listen for `keydown` with `e.key === 'Alt'` to show popup
- Listen for `keyup` with `e.key === 'Alt'` to hide popup
- Must handle edge case: Alt released while window unfocused (use `blur` event)

### 3. Render ShortcutsPopup in App.jsx
**Location:** `/home/p4ulcristian/Work/iris/app/src/App.jsx`

- Import and render `<ShortcutsPopup isOpen={showShortcuts} />`
- Place alongside other modals (SummonModal, ConfirmModal)

### 4. Styling
**Location:** `/home/p4ulcristian/Work/iris/app/src/styles/index.css` (optional)

- Reuse existing `liquid-glass-modal` class
- Add subtle entrance animation (fade in quickly since Alt-hold is brief)
- Use grid layout for shortcut display
- Style shortcut keys with `<kbd>` styling (rounded, bordered)

---

## Component Design

```jsx
// ShortcutsPopup.jsx structure
<div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
  <div className="liquid-glass-modal p-6 max-w-2xl">
    <h2>Keyboard Shortcuts</h2>

    <div className="grid grid-cols-2 gap-6">
      <Section title="Tabs">
        <Shortcut keys={['Alt', 'T']} action="New tab" />
        <Shortcut keys={['Alt', 'W']} action="Close tab" />
        ...
      </Section>

      <Section title="Entities">
        <Shortcut keys={['Alt', 'N']} action="Summon god" />
        ...
      </Section>

      <Section title="Navigation">
        ...
      </Section>

      <Section title="Window">
        ...
      </Section>
    </div>
  </div>
</div>
```

---

## Key Considerations

1. **No backdrop click needed** - popup is display-only while Alt held
2. **No pointer events** - use `pointer-events-none` so it doesn't interfere
3. **Fast animation** - quick fade-in (100-150ms) since user expects immediate feedback
4. **Handle Alt+Tab** - system Alt+Tab might cause Alt to "stick"; use window blur to reset
5. **Don't show during modals** - if SummonModal or ConfirmModal is open, skip showing shortcuts

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `app/src/components/ShortcutsPopup.jsx` | **Create** - New component |
| `app/src/App.jsx` | **Modify** - Add state, keyup listener, render popup |
| `app/src/styles/index.css` | **Modify** (optional) - Add `<kbd>` styling if needed |

---

## Estimated Changes
- ~60-80 lines for ShortcutsPopup.jsx
- ~15-20 lines added to App.jsx
- ~10 lines of CSS (optional)
