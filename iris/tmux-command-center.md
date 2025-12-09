# Iris Command Center - tmux Styling Guide

Visual design for making the master pane look like a sci-fi command center, with worker panes as subordinate side panels.

---

## Full Layout Mockup

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                                        │
│  ◤━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━◥ ┆ ┌╌╌╌╌╌╌╌╌╌╌╌╌╌┐ │
│  ┃ ⚡ IRIS MASTER ⚡  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ┃ ┆ ╎ 「 worker 」╎ │
│  ┃                                                                                 ┃ ┆ ╎ ironrainbow ╎ │
│  ┃  ┌─────────────────────────────────────────────────────────────────────────┐   ┃ ┆ ╎             ╎ │
│  ┃  │                                                                         │   ┃ ┆ ╎ ◐ working   ╎ │
│  ┃  │   paul@iris ~/Think                                                     │   ┃ ┆ ╎             ╎ │
│  ┃  │   ❯ _                                                                   │   ┃ ┆ ╎ shader bug  ╎ │
│  ┃  │                                                                         │   ┃ ┆ ╎ fix in      ╎ │
│  ┃  │                                                                         │   ┃ ┆ ╎ progress... ╎ │
│  ┃  │                                                                         │   ┃ ┆ ╎             ╎ │
│  ┃  │                       [ MAIN WORKSPACE ]                                │   ┃ ┆ ╎ ▁▂▃▅▇█▅▃▂  ╎ │
│  ┃  │                                                                         │   ┃ ┆ └╌╌╌╌╌╌╌╌╌╌╌╌╌┘ │
│  ┃  │                     This is where you work                              │   ┃ ┆ ┌╌╌╌╌╌╌╌╌╌╌╌╌╌┐ │
│  ┃  │                     Full brightness, crisp text                         │   ┃ ┆ ╎ 「 worker 」╎ │
│  ┃  │                     Heavy borders, prominent                            │   ┃ ┆ ╎ elevathor   ╎ │
│  ┃  │                                                                         │   ┃ ┆ ╎             ╎ │
│  ┃  │                                                                         │   ┃ ┆ ╎ ● idle      ╎ │
│  ┃  │                                                                         │   ┃ ┆ ╎             ╎ │
│  ┃  │                                                                         │   ┃ ┆ ╎ waiting for ╎ │
│  ┃  │                                                                         │   ┃ ┆ ╎ instructions╎ │
│  ┃  │                                                                         │   ┃ ┆ ╎             ╎ │
│  ┃  └─────────────────────────────────────────────────────────────────────────┘   ┃ ┆ ╎ ▁▁▁▁▁▁▁▁▁  ╎ │
│  ┃                                                                                 ┃ ┆ └╌╌╌╌╌╌╌╌╌╌╌╌╌┘ │
│  ┃  STATUS: ◉ ONLINE    WORKERS: 2/2 active    ▂▃▅▇█▆▄▂▁▃▅▇█▅▃▂                   ┃ ┆ ┌╌╌╌╌╌╌╌╌╌╌╌╌╌┐ │
│  ◣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━◢ ┆ ╎ 「 worker 」╎ │
│                                                                                      ┆ ╎ colormecrazy╎ │
│  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓ ┆ ╎             ╎ │
│  ┃ session:iris │ 3 workers │ ⚡ voice: on │ 14:32:07 │ CPU ████░░ │ MEM ██████░ ┃ ┆ ╎ ● idle      ╎ │
│  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ ┆ └╌╌╌╌╌╌╌╌╌╌╌╌╌┘ │
│                                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Color Scheme

### Master Pane
| Element    | Color     | Hex       | Description                    |
|------------|-----------|-----------|--------------------------------|
| Border     | Cyan      | `#00ffaa` | Bright, attention-grabbing     |
| Background | Black     | `#000000` | Pure black for contrast        |
| Text       | White     | `#ffffff` | Full brightness                |
| Accents    | Gold      | `#ffcc00` | For ⚡ symbols and highlights  |

### Worker Panes
| Element    | Color     | Hex       | Description                    |
|------------|-----------|-----------|--------------------------------|
| Border     | Dark Gray | `#3a3a3a` | Subtle, doesn't compete        |
| Background | Near-black| `#0a0a0a` | Dimmed to recede visually      |
| Text       | Gray      | `#888888` | Muted, secondary importance    |
| Status     | Dim Gray  | `#666666` | Even more subtle               |

### Status Bar
| Element    | Color     | Hex       | Description                    |
|------------|-----------|-----------|--------------------------------|
| Background | Dark      | `#1a1a1a` | Slightly lighter than panes    |
| Text       | Light Gray| `#aaaaaa` | Readable but not dominant      |
| Highlights | Cyan      | `#00ffaa` | Match master border            |
| Progress   | Green     | `#00ff88` | Filled portions                |

---

## Pane Border Formats

### Master Title
```
◤━━━ ⚡ IRIS MASTER ⚡ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━◥
```

### Worker Titles (by status)
```
┄┄ 「 ironrainbow 」 ◐ working ━━ shader bug fix ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄   (busy)
┄┄ 「 elevathor 」 ● idle ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄   (idle)
┄┄ 「 colormecrazy 」 ✗ error ━━ build failed ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄   (error)
```

---

## Status Indicators

| Symbol | Status   | Color     | Meaning                        |
|--------|----------|-----------|--------------------------------|
| `●`    | idle     | `#666666` | Waiting for instructions       |
| `◐`    | working  | `#ffcc00` | Actively processing            |
| `◉`    | done     | `#00ff88` | Task completed successfully    |
| `✗`    | error    | `#ff4444` | Something went wrong           |
| `◌`    | starting | `#888888` | Worker initializing            |

### Activity Sparklines
```
▁▂▃▅▇█▅▃▂   (recent activity - 8 levels of intensity)
```

---

## Alternative Layouts

### Layout A: Master Left, Workers Right (Recommended)
```
┌──────────────────────────────────┬─────────────┐
│                                  │  worker 1   │
│          MASTER                  ├─────────────┤
│          (large)                 │  worker 2   │
│                                  ├─────────────┤
│                                  │  worker 3   │
└──────────────────────────────────┴─────────────┘
```

### Layout B: Master Top, Workers Below
```
┌────────────────────────────────────────────────┐
│                    MASTER                      │
│                   (wide)                       │
├────────────────┬───────────────┬───────────────┤
│   worker 1     │   worker 2    │   worker 3    │
└────────────────┴───────────────┴───────────────┘
```

### Layout C: Cockpit Style
```
┌─────────────┬─────────────────────────┬─────────────┐
│  worker 1   │                         │  worker 2   │
│  (narrow)   │        MASTER           │  (narrow)   │
│             │        (focus)          │             │
├─────────────┴─────────────────────────┴─────────────┤
│              worker 3 (logs/output)                 │
└─────────────────────────────────────────────────────┘
```

---

## tmux Configuration

Add to `~/.tmux.conf`:

```bash
# ═══════════════════════════════════════════════════════════════════
#  IRIS COMMAND CENTER THEME
# ═══════════════════════════════════════════════════════════════════

# Enable pane border status (titles)
set -g pane-border-status top
set -g pane-border-lines heavy
set -g pane-border-indicators both

# ─────────────────────────────────────────────────────────────────────
#  Pane Styles (active vs inactive creates master/worker distinction)
# ─────────────────────────────────────────────────────────────────────

# Inactive panes (workers) - dimmed
set -g window-style 'fg=#888888,bg=#0a0a0a'
set -g pane-border-style 'fg=#3a3a3a'

# Active pane (master) - bright and prominent
set -g window-active-style 'fg=#ffffff,bg=#000000'
set -g pane-active-border-style 'fg=#00ffaa'

# ─────────────────────────────────────────────────────────────────────
#  Pane Border Format (uses @role user option)
# ─────────────────────────────────────────────────────────────────────

# Dynamic format based on @role variable
# Master: ◤━━━ ⚡ IRIS MASTER ⚡ ━━━◥
# Worker: ┄┄ 「 name 」 status ┄┄
set -g pane-border-format '\
#{?#{==:#{@role},master},\
#[fg=#00ffaa]◤━━━ ⚡ IRIS MASTER ⚡ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━◥#[default],\
#[fg=#555555]┄┄ 「 #{@name} 」 #{@status} ┄┄ #{@task} #[default]}'

# ─────────────────────────────────────────────────────────────────────
#  Status Bar
# ─────────────────────────────────────────────────────────────────────

set -g status-position bottom
set -g status-style 'bg=#1a1a1a,fg=#aaaaaa'

set -g status-left '#[fg=#00ffaa,bold] session:#{session_name} #[default]│ '
set -g status-left-length 30

set -g status-right ' │ %H:%M:%S │ CPU #{cpu_percentage} │ MEM #{ram_percentage} '
set -g status-right-length 60

# Window status
set -g window-status-format '#[fg=#666666] #I:#W '
set -g window-status-current-format '#[fg=#00ffaa,bold] #I:#W '
```

---

## Setting Pane Roles

When spawning workers or setting up master, use these commands:

```bash
# Mark the master pane
tmux set -p @role "master"

# Mark a worker pane with details
tmux set -p @role "worker"
tmux set -p @name "ironrainbow"
tmux set -p @status "● idle"
tmux set -p @task ""

# Update worker status
tmux set -p @status "◐ working"
tmux set -p @task "fixing shader bug"
```

---

## Unicode Reference

### Box Drawing
```
Heavy:   ━ ┃ ┏ ┓ ┗ ┛ ┣ ┫ ┳ ┻ ╋
Light:   ─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼
Double:  ═ ║ ╔ ╗ ╚ ╝ ╠ ╣ ╦ ╩ ╬
Dashed:  ┄ ┅ ┆ ┇ ╌ ╍ ╎ ╏
Rounded: ╭ ╮ ╰ ╯
```

### HUD Corners
```
◤ ◥ ◣ ◢   (triangular - sci-fi feel)
```

### Decorative Brackets
```
「 」  Japanese brackets (clean, minimal)
【 】  Heavy brackets
〔 〕  Tortoise shell brackets
⟦ ⟧   Mathematical brackets
```

### Progress/Sparklines
```
Horizontal: ▏ ▎ ▍ ▌ ▋ ▊ ▉ █
Vertical:   ▁ ▂ ▃ ▄ ▅ ▆ ▇ █
Shading:    ░ ▒ ▓ █
```

### Status Symbols
```
● ○ ◉ ◐ ◑ ◒ ◓ ◌   (circles)
✓ ✗ ⚠                (check/x/warn)
▶ ■ ▷ ⏸              (play/stop/pause)
⚡ ⚙ ★                (lightning/gear/star)
```

---

## Ghostty Enhancements

Add to `~/.config/ghostty/config` for extra sci-fi effects:

```
# CRT scanline effect
custom-shader = ~/.config/ghostty/shaders/crt.glsl
custom-shader-animation = true

# Bloom/glow effect
custom-shader = ~/.config/ghostty/shaders/bloom.glsl

# Slight transparency for floating feel
background-opacity = 0.95

# Ensure nerd fonts work
font-family = JetBrainsMono Nerd Font
```

Shader repos:
- https://github.com/thijskok/ghostty-shaders
- https://github.com/m-ahdal/ghostty-shaders
