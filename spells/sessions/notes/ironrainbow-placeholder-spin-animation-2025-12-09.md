# Iron Rainbow: Placeholder Spin Animation

**Worker:** Kai
**Date:** 2025-12-09
**Status:** completed

## Summary

Explored how the placeholder spin animation works in the Iron Rainbow Customizer. The animation uses FontAwesome's built-in `fa-spin` class on spinner icons throughout the application.

## Key Findings

### 1. FontAwesome Spinner Pattern
The codebase consistently uses FontAwesome icons with the `fa-spin` class for loading states:

```clojure
[:i {:class "fa-solid fa-spinner fa-spin"}]
```

This is the primary pattern - FontAwesome provides the spin animation via CSS (360-degree rotation).

### 2. Thumbnail/Card Loading Spinner
Location: `project/code/features/customizer/webshop/frontend/blocks/menu/cards.cljs:108-119`

```clojure
(defn spinner []
  [:div {:style {:position "absolute"
                 :top "0" :left "0" :right "0" :bottom "0"
                 :display "flex"
                 :align-items "center"
                 :justify-content "center"}}
   [:i {:class "fa-solid fa-spinner fa-spin"
        :style {:font-size "24px"
                :color "rgba(255, 255, 255, 0.5)"}}]])
```

Used in `thumbnail` component when image is loading but not yet displayed.

### 3. Category Card Shimmer Animation
Location: `project/code/features/customizer/webshop/frontend/layout_desktop/header/menu/menu.css:5-17`

Separate from spinners, there's a shimmer effect on unselected category cards:

```css
@keyframes category-card-shimmer {
  0%, 100% {
    background-position: 0% 0%;
    border-color: hsla(from var(--color-brand) h s l / 0.2);
  }
  50% {
    background-position: 100% 0%;
    border-color: hsla(from var(--color-brand) h s l / 0.4);
  }
}

.customizer--category-card[data-animate="true"]:not([data-selected="true"]) {
  animation: category-card-shimmer 2.5s ease-in-out infinite;
}
```

This creates a subtle gradient sweep effect on cards that aren't selected.

### 4. Other Spinner Locations

| File | Purpose |
|------|---------|
| `orders.cljs:78` | "In progress" status with gear icon (`fa-gear fa-spin`) |
| `orders.cljs:83,91` | Generic order processing states |
| `orders.cljs:223` | Loading orders list |
| `stripe.cljs:158,240` | Payment processing |
| `location/view.cljs:122` | Location lookup |
| `properties/components.cljs:83,530` | Properties panel loading |
| `my_designs/my_designs.cljs:144` | My designs loading |
| `populars.cljs:104` | Popular items loading |
| `cards.cljs:117,191` (desktop) | Thumbnail loading |
| `cards.cljs:118,202` (mobile) | Thumbnail loading (same pattern) |

### 5. Static Placeholders (Non-animated)

The job item placeholder (`orders.cljs:100-101`) shows a static box icon when no image exists:
```clojure
[:div {:class "customizer-job-item__placeholder"}
 [:i {:class "fa-solid fa-box"}]]
```

CSS at `orders.css:505-516` - no animation, just a styled container.

## Changes Made
- None (exploration only)

## Next Steps
- None needed - documentation complete

## Context for Future Workers

The placeholder spin pattern is simple:
1. **Loading states** → `fa-spinner fa-spin` (FontAwesome handles animation)
2. **Card shimmer** → CSS keyframe animation on background gradient
3. **Static placeholders** → Icon in styled div, no animation

If you need to add a new loading spinner, just use the FontAwesome pattern. The animation is built-in, no custom CSS needed.
