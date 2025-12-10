# Terminal Multiplexer Comparison (2025)

A comprehensive comparison of terminal multiplexers and related tools.

---

## Quick Reference Table

| Tool | Type | Language | Active Dev | Learning Curve | Best For |
|------|------|----------|------------|----------------|----------|
| **tmux** | Multiplexer | C | Yes | Medium | Power users, servers, remote work |
| **GNU Screen** | Multiplexer | C | Minimal | Medium | Legacy systems, serial connections |
| **Zellij** | Multiplexer | Rust | Yes | Low | Beginners, modern UX |
| **Byobu** | Wrapper | Shell | Yes | Low | Easy tmux/screen enhancement |
| **dvtm + abduco** | Multiplexer | C | Low | High | Minimalists, Unix purists |
| **mtm** | Multiplexer | C | Stable | Low | Minimal environments |
| **WezTerm** | Emulator + Mux | Rust | Yes | Medium | Cross-platform, Lua enthusiasts |
| **Kitty** | Emulator + Mux | C/Python | Yes | Medium | Graphics, scripting |

---

## Detailed Comparisons

### tmux

**Overview:** The dominant terminal multiplexer since 2009, offering a client-server architecture with extensive customization.

**Key Features:**
- Client-server architecture for flexible session management
- Horizontal and vertical pane splitting
- Status bar with extensive customization
- Session persistence across disconnects
- Scriptable via `tmux command` language (shell-like)
- Panes retained when reattaching sessions

**Plugin Ecosystem:**
- **TPM (Tmux Plugin Manager)** - De facto standard plugin manager
- Popular plugins:
  - `tmux-resurrect` - Session persistence across restarts
  - `tmux-continuum` - Automatic session saving/restore
  - `tmux-sensible` - Sensible defaults
  - `tmux-battery`, `tmux-cpu` - Status bar indicators
- 27+ official plugins in tmux-plugins organization

**Status Bar:**
- Highly customizable
- Supports powerline, custom scripts
- Can display: time, date, battery, CPU, git status, weather, etc.

**Pane Management:**
- Flexible splitting (horizontal/vertical)
- Resize with keyboard
- Swap panes
- Break pane to window
- Join panes from windows

**Session Handling:**
- Named sessions
- Detach/reattach from any terminal
- Session groups for collaboration
- Scriptable session creation

**Configuration:**
- `~/.tmux.conf`
- Key rebinding
- Color schemes
- Status bar customization
- Plugin configuration

**Performance:**
- Lightweight (~2MB RAM per session)
- Fast startup
- Efficient for remote connections

**Default Prefix:** `Ctrl-b`

**Pros:**
- Most popular, extensive community support
- Huge plugin ecosystem
- Battle-tested stability
- Works everywhere

**Cons:**
- Config file can become complex
- Learning curve for keybindings
- No built-in serial/telnet support

---

### GNU Screen

**Overview:** The original terminal multiplexer (1987), still maintained but with minimal active development.

**Key Features:**
- Session detach/reattach
- Window management
- Session sharing with multiple users
- Serial port and telnet support (unique feature)
- Split regions (added later)

**Plugin Ecosystem:**
- No formal plugin system
- Configuration-based customization only

**Status Bar:**
- Not enabled by default
- Requires manual configuration
- Less flexible than tmux

**Pane Management:**
- Horizontal splits (vertical added in v4.1)
- Panes lost on detach (major limitation)
- Less intuitive than tmux

**Session Handling:**
- Limited to same-terminal reattach
- Multi-user session sharing (screen -x)
- ACL-based access control

**Configuration:**
- `~/.screenrc`
- Custom scripting language (C-like)
- Less intuitive than tmux

**Performance:**
- Lightweight
- Widely pre-installed

**Default Prefix:** `Ctrl-a`

**Pros:**
- Pre-installed on most systems
- Serial/telnet support
- Multi-user session sharing

**Cons:**
- Panes lost on detach
- Limited development
- Dated interface
- Less community support

---

### Zellij

**Overview:** Modern Rust-based multiplexer focused on beginner-friendliness without sacrificing power.

**Key Features:**
- Context-aware on-screen keybinding hints
- Built-in session manager
- Floating and stacked panes
- WebAssembly plugin system
- True multiplayer collaboration
- Mouse support
- Built-in web client
- Session resurrection by default

**Plugin Ecosystem:**
- WebAssembly-based plugins (any language that compiles to WASM)
- Built-in plugins: status bar, file picker, tab manager
- Plugin API for custom development

**Status Bar:**
- Beautiful default status bar
- Shows CPU, memory, battery
- Contextual keybinding display
- Plugin-extensible

**Pane Management:**
- Floating panes (unique)
- Stacked panes
- Standard splits
- Mouse resize/move
- Visual pane indicators

**Session Handling:**
- Automatic session creation with random names
- Built-in session manager
- Full program restoration
- No external plugin needed

**Configuration:**
- YAML/KDL configuration
- Layout files for workspace templates
- Keybinding customization

**Performance:**
- Low memory usage (past memory leak fixed)
- Rust performance
- Slightly higher baseline than tmux

**Default Navigation:** `Alt + hjkl` or arrow keys

**Pros:**
- Best beginner experience
- Works out of the box
- Modern features (floating panes, layouts)
- Excellent defaults
- WebAssembly extensibility

**Cons:**
- Smaller community than tmux
- Fewer third-party integrations
- Resource usage slightly higher

---

### Byobu

**Overview:** User-friendly wrapper around tmux or GNU Screen, providing enhanced defaults and visual features.

**Key Features:**
- Wraps tmux or screen (selectable backend)
- Function key shortcuts (F2, F3, F4, etc.)
- Pre-configured status bar
- System notifications
- Easy split creation

**Plugin Ecosystem:**
- Inherits from underlying backend (tmux/screen)
- Custom status scripts

**Status Bar:**
- Rich default status bar
- System stats (CPU, memory, disk, network)
- Customizable indicators
- Toggle-able elements

**Pane Management:**
- Simplified via function keys
- Same capabilities as backend

**Session Handling:**
- Same as underlying backend
- Simplified keybindings

**Configuration:**
- `byobu-config` TUI utility
- Status toggles via `byobu-select-profile`
- Backend selection via `byobu-select-backend`

**Performance:**
- Same as underlying backend
- Small shell script overhead

**Default Shortcuts:**
- `F2` - New window
- `F3/F4` - Previous/next window
- `F6` - Detach
- `Shift-F2` - Horizontal split
- `Ctrl-F2` - Vertical split

**Pros:**
- Easiest entry point
- Beautiful defaults
- Function key shortcuts
- System monitoring built-in

**Cons:**
- Abstraction layer adds complexity
- Limited customization vs raw tmux
- Dependency on wrapper scripts

---

### dvtm + abduco

**Overview:** Minimalist, Unix-philosophy approach - dvtm handles tiling window management, abduco handles session management.

**Key Features:**
- Separation of concerns (multiplexing vs. sessions)
- Tiling window layouts (4 built-in)
- Tiny codebase (~4000 lines)
- Copy mode via external editor
- Tagging support

**Plugin Ecosystem:**
- None - compile-time configuration
- Minimal by design

**Status Bar:**
- Basic bar showing window info
- Customizable via source modification

**Pane Management:**
- 4 layouts: vertical stack, bottom stack, grid, fullscreen
- Dynamic tiling (dwm-style)
- Master/stack arrangement

**Session Handling (abduco):**
- Separate process
- Simple attach/detach
- Session listing

**Configuration:**
- Compile-time via `config.h`
- Keybindings set at compile time
- Suckless-style configuration

**Performance:**
- Extremely lightweight
- Minimal dependencies
- Fast startup

**Default Prefix:** `Ctrl-g`

**Pros:**
- Minimal, focused design
- Tiny footprint
- Unix philosophy
- Simple codebase

**Cons:**
- Requires recompilation for config changes
- Small community
- Limited features
- Steep learning curve
- Often outdated in repos

---

### mtm (Micro Terminal Multiplexer)

**Overview:** Perhaps the smallest useful terminal multiplexer (~1000 lines of C), focused on simplicity and stability.

**Key Features:**
- Three commands only: change focus, split, close
- Classic ANSI terminal emulation
- VT100/102 compatibility
- Scrollback buffer
- No modes or complex features

**Plugin Ecosystem:**
- None - by design

**Status Bar:**
- None - minimal design

**Pane Management:**
- Split (horizontal/vertical)
- Focus change
- Close pane
- No layouts

**Session Handling:**
- No built-in session management
- Use with abduco or dtach

**Configuration:**
- Minimal compile-time options
- Command-line flags

**Performance:**
- Extremely lightweight
- Fast
- Requires ncursesw only

**Pros:**
- Minimal and stable
- "Finished" software - no breaking changes
- Excellent terminal emulation
- Tiny footprint

**Cons:**
- No session management
- No status bar
- Very basic features
- Niche use case

---

### WezTerm

**Overview:** GPU-accelerated terminal emulator with built-in multiplexing, configured via Lua.

**Key Features:**
- GPU-accelerated rendering
- Built-in multiplexing (tabs, panes, windows)
- Lua configuration with hot reload
- SSH multiplexing with auto-reconnect
- Serial port support
- Image protocol support
- Cross-platform (Linux, macOS, Windows)
- Workspaces/sessions

**Plugin Ecosystem:**
- Lua scripting (not traditional plugins)
- `wezterm.action_callback()` for custom actions
- Community configs and snippets

**Status Bar:**
- Configurable tab bar
- Custom Lua-rendered elements
- Can show any data via scripting

**Pane Management:**
- Splits, tabs, windows
- Mouse and keyboard control
- Programmatic via CLI

**Session Handling:**
- Workspaces
- Session persistence
- SSH domain auto-discovery from ~/.ssh/config

**Configuration:**
- `~/.config/wezterm/wezterm.lua`
- Hot reload
- Full Lua programming power

**Performance:**
- GPU-accelerated
- Fast rendering
- Higher baseline memory (full emulator)

**Pros:**
- Modern, feature-rich
- Lua configuration power
- Cross-platform consistency
- Replaces both terminal + multiplexer

**Cons:**
- Heavier than dedicated multiplexer
- Not suitable for minimal servers
- Learning Lua configuration

---

### Kitty

**Overview:** GPU-accelerated terminal emulator with powerful built-in multiplexing and Python scripting.

**Key Features:**
- GPU rendering (OpenGL)
- Built-in multiplexing
- Graphics protocol (images in terminal)
- Python scripting (kittens)
- Unicode/emoji support
- Ligatures

**Plugin Ecosystem:**
- "Kittens" - Python extensions
- Remote control API
- Custom graphics protocol

**Status Bar:**
- Tab bar
- Custom kittens can add functionality

**Pane Management:**
- Layouts (splits, stacks, etc.)
- Tabs and windows
- Mouse support

**Session Handling:**
- Session management
- Startup sessions
- Remote control

**Configuration:**
- `~/.config/kitty/kitty.conf`
- Python scripting for extensions

**Performance:**
- GPU-accelerated
- Fast rendering
- Image display capability

**Pros:**
- Graphics protocol (unique)
- Powerful Python scripting
- Modern rendering

**Cons:**
- OpenGL requirement
- Not for minimal systems
- More resource-intensive

---

## Feature Comparison Matrix

| Feature | tmux | Screen | Zellij | Byobu | dvtm+abduco | mtm | WezTerm | Kitty |
|---------|------|--------|--------|-------|-------------|-----|---------|-------|
| Session Persistence | Yes | Yes | Yes | Yes | Yes (abduco) | No | Yes | Yes |
| Pane Splits | Yes | Limited | Yes | Yes | Yes | Yes | Yes | Yes |
| Floating Panes | No | No | Yes | No | No | No | No | No |
| Mouse Support | Yes | Limited | Yes | Yes | No | No | Yes | Yes |
| Plugin System | TPM | No | WASM | Backend | No | No | Lua | Python |
| Status Bar | Yes | Manual | Yes | Yes | Basic | No | Tab bar | Tab bar |
| GUI Integration | No | No | No | No | No | No | Yes | Yes |
| GPU Acceleration | N/A | N/A | N/A | N/A | N/A | N/A | Yes | Yes |
| Serial Support | No | Yes | No | Backend | No | No | Yes | No |
| Multi-user Sharing | Limited | Yes | Yes | Backend | No | No | No | No |
| Cross-platform | Unix | Unix | Unix | Unix | Unix | Unix | All | Unix |
| Scripting | Shell | Custom | WASM | Backend | No | No | Lua | Python |

---

## Use Case Recommendations

### For Beginners
**Zellij** - Best out-of-box experience with visual keybinding hints

### For Servers/Remote Work
**tmux** - Lightweight, universal, well-documented

### For Legacy Systems
**GNU Screen** - Pre-installed everywhere, serial support

### For Quick Setup
**Byobu** - Beautiful defaults, minimal configuration

### For Minimalists
**dvtm + abduco** or **mtm** - Unix philosophy, tiny footprint

### For Modern Desktop
**WezTerm** or **Kitty** - GPU rendering, integrated experience

### For Cross-Platform
**WezTerm** - Consistent across Linux, macOS, Windows

### For Plugin Enthusiasts
**tmux + TPM** - Largest ecosystem

### For Collaboration
**Zellij** - True multiplayer features

---

## Sources

- [tmux Wiki](https://github.com/tmux/tmux/wiki/)
- [Zellij GitHub](https://github.com/zellij-org/zellij)
- [Zellij About](https://zellij.dev/about/)
- [Byobu Official](https://www.byobu.org/)
- [WezTerm Features](https://wezterm.org/features.html)
- [WezTerm Multiplexing](https://wezterm.org/multiplexing.html)
- [TPM - Tmux Plugin Manager](https://github.com/tmux-plugins/tpm)
- [mtm GitHub](https://github.com/deadpixi/mtm)
- [dvtm vs tmux - Slant](https://www.slant.co/versus/11858/11860/~tmux_vs_abduco-dvtm)
- [Terminal Multiplexers - Slant](https://www.slant.co/topics/4018/~terminal-multiplexers)
- [Kitty Terminal](https://sw.kovidgoyal.net/kitty/)
- [tmux vs Screen - How-To Geek](https://www.howtogeek.com/671422/how-to-use-tmux-on-linux-and-why-its-better-than-screen/)
- [Zellij Review - TecMint](https://www.tecmint.com/zellij-linux-terminal-multiplexer/)
- [Ubuntu Byobu Docs](https://ubuntu.com/server/docs/byobu)

---

# Iris Migration Plan: tmux → WezTerm (Pure)

*Goal: Replace tmux entirely with WezTerm's native multiplexing.*

## Executive Summary

**Feasibility: Possible with compromises.**

WezTerm lacks tmux's `pane-border-status` (per-pane title bars). This is Iris's core UX element. Migration requires rethinking how shade identity is displayed.

| Feature | tmux Current | WezTerm Native | Gap |
|---------|--------------|----------------|-----|
| Per-pane title bar | `pane-border-status top` | **Not supported** | Critical |
| Per-pane background | `select-pane -P bg=...` | Escape sequences only | Workaround exists |
| Split panes | `split-window` | `wezterm cli split-pane` | Equivalent |
| Send text | `tmux send-keys` | `wezterm cli send-text` | Equivalent |
| Capture output | `tmux capture-pane` | `wezterm cli get-text` | Equivalent |
| Session persistence | Detach/attach anywhere | GUI-bound workspaces | Limitation |
| CLI control | Full | Full | Equivalent |
| Scripting | Shell + tmux commands | Lua + CLI | More powerful |

---

## Architecture Options

### Option A: Tabs-as-Shades (Recommended)

Each shade becomes a separate tab instead of a pane.

```
┌─────────────────────────────────────────────────────────────────┐
│ [Iris] [Ruby: Fix shader] [Amber: Run tests] [Jade: Refactor]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                     Active shade (full screen)                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Pros:**
- Tab titles provide clear shade identity
- Tab colors can be customized per-shade via `format-tab-title`
- Clean, native WezTerm UX
- Simpler implementation

**Cons:**
- Lose simultaneous view of multiple shades
- Must switch tabs to see other shades

**Best for:** Single-focus work, cleaner UI

---

### Option B: Panes + Injected Identity

Keep split panes, inject shade identity via escape sequences.

```
┌────────────────────────────────┬────────────────────────────────┐
│ ┌─ Ruby ─────────────────────┐ │ ┌─ Amber ────────────────────┐ │
│ │ claude ...                 │ │ │ claude ...                 │ │
│ │                            │ │ │                            │ │
│ └────────────────────────────┘ │ └────────────────────────────┘ │
└────────────────────────────────┴────────────────────────────────┘
```

Identity shown via:
1. **Injected header line** - Use `pane:inject_output()` to draw a colored header
2. **Custom PS1 prompt** - Shade name in shell prompt
3. **Background color** - Via OSC escape sequences

**Pros:**
- Side-by-side shade visibility (like current tmux setup)
- Can approximate current UX

**Cons:**
- Injected content can be overwritten by pane output
- More complex to maintain
- Background colors via escape sequences are fragile

**Best for:** Users who need multi-shade visibility

---

### Option C: Hybrid Tab-Pane Layout

Iris tab contains split panes; other tabs for utilities.

```
┌─────────────────────────────────────────────────────────────────┐
│ [Shades] [Logs] [Config]                                        │
├─────────────────────────────────────────────────────────────────┤
│ ┌──────────────────┬──────────────────┬──────────────────┐      │
│ │ Ruby             │ Amber            │ Jade             │      │
│ │ (pane)           │ (pane)           │ (pane)           │      │
│ └──────────────────┴──────────────────┴──────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

**Identity via:** Right-status showing active pane name, or injected headers.

---

## Recommended Approach: Option A (Tabs-as-Shades)

This is the cleanest migration path that works with WezTerm's strengths.

---

## Implementation Plan

### Phase 1: WezTerm Configuration

Create `~/.config/wezterm/wezterm.lua`:

```lua
local wezterm = require 'wezterm'
local config = wezterm.config_builder()

-- Shade color definitions (mirrors config/shades.json)
local shades = {
  Ruby    = { bg = "#2a1a1a", header = "#dc143c" },
  Amber   = { bg = "#2a1f1a", header = "#ff8c00" },
  Sol     = { bg = "#2a2a1a", header = "#ffd700" },
  Jade    = { bg = "#1a2a1a", header = "#2e8b57" },
  Azure   = { bg = "#1a1a2a", header = "#007fff" },
  Indigo  = { bg = "#1f1a2a", header = "#4b0082" },
  Violet  = { bg = "#2a1a2a", header = "#8b00ff" },
  Coral   = { bg = "#2a1a1f", header = "#ff7f50" },
  Cyan    = { bg = "#1a2a2a", header = "#00ced1" },
  Magenta = { bg = "#2a1a2a", header = "#ff00ff" },
  Crimson = { bg = "#2a2a1f", header = "#dc143c" },
  Gold    = { bg = "#2a2a1a", header = "#ffd700" },
}

-- Iris theme
config.colors = {
  background = "#1f1a28",  -- Nebula (Iris main)
  split = "#c9b1d4",       -- Silver-violet
  tab_bar = {
    background = "#1f1a28",
    active_tab = {
      bg_color = "#c9b1d4",
      fg_color = "#000000",
    },
    inactive_tab = {
      bg_color = "#2a2a3a",
      fg_color = "#888888",
    },
  },
}

-- Format tab titles with shade colors
wezterm.on('format-tab-title', function(tab, tabs, panes, config, hover, max_width)
  local title = tab.tab_title
  if #title == 0 then
    title = tab.active_pane.title
  end

  -- Check if this is a shade tab
  for name, colors in pairs(shades) do
    if title:find("^" .. name) then
      return {
        { Background = { Color = colors.header } },
        { Foreground = { Color = "#ffffff" } },
        { Attribute = { Intensity = "Bold" } },
        { Text = " " .. title .. " " },
      }
    end
  end

  -- Default Iris tab
  if title == "Iris" or title:find("^Iris") then
    return {
      { Background = { Color = "#c9b1d4" } },
      { Foreground = { Color = "#000000" } },
      { Text = " " .. title .. " " },
    }
  end

  return title
end)

-- Update right status with active shade info
wezterm.on('update-right-status', function(window, pane)
  local cwd = pane:get_current_working_dir()
  local title = pane:get_title()

  window:set_right_status(wezterm.format({
    { Foreground = { Color = "#888888" } },
    { Text = title .. " " },
  }))
end)

-- Window settings
config.window_decorations = "RESIZE"
config.window_padding = { left = 8, right = 8, top = 8, bottom = 8 }
config.use_fancy_tab_bar = true
config.hide_tab_bar_if_only_one_tab = false
config.tab_bar_at_bottom = false

-- Inactive pane dimming
config.inactive_pane_hsb = {
  saturation = 0.8,
  brightness = 0.7,
}

-- Font
config.font = wezterm.font("JetBrains Mono")
config.font_size = 11.0

return config
```

---

### Phase 2: New Spells (Shell Scripts)

#### `spells/iris-wez.sh` (Main CLI)

```bash
#!/bin/bash
# Iris CLI - WezTerm native version

IRIS_DIR="$HOME/Iris"
SPELLS_DIR="$IRIS_DIR/spells"

cmd_start() {
    # Check if WezTerm is running with Iris workspace
    if wezterm cli list 2>/dev/null | grep -q "Iris"; then
        # Focus existing
        wezterm cli activate-tab --tab-id $(wezterm cli list --format json | jq -r '.[] | select(.tab_title == "Iris") | .tab_id')
    else
        # Start new WezTerm with Iris
        wezterm start --cwd "$IRIS_DIR" -- claude --dangerously-skip-permissions &
        sleep 1
        wezterm cli set-tab-title "Iris"
    fi
}

cmd_spawn() {
    local project=""
    local project_dir=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --project)
                project="$2"
                shift 2
                case "$project" in
                    ironrainbow) project_dir="/home/paul/Work/ironrainbow" ;;
                    elevathor) project_dir="/home/paul/Work/elevathor" ;;
                    colormecrazy) project_dir="/home/paul/Work/colormecrazy" ;;
                    iris) project_dir="/home/paul/Work/iris" ;;
                esac
                ;;
            *) break ;;
        esac
    done

    local task="$*"

    # Get next available color
    local color_json=$("$SPELLS_DIR/color.sh" next)
    local color_name=$(echo "$color_json" | jq -r '.name')
    local worker_uuid="${color_name,,}-$(date +%Y%m%d-%H%M%S)-$(openssl rand -hex 2)"

    # Build init message
    local init_msg="You are $color_name. Your UUID is $worker_uuid. Your task: $task"

    # Spawn new tab
    local pane_id
    if [ -n "$project_dir" ]; then
        pane_id=$(wezterm cli spawn --cwd "$IRIS_DIR" -- claude --dangerously-skip-permissions --add-dir "$project_dir" "$init_msg")
    else
        pane_id=$(wezterm cli spawn --cwd "$IRIS_DIR" -- claude --dangerously-skip-permissions "$init_msg")
    fi

    # Set tab title (shade name + task)
    local short_task="${task:0:40}"
    [ ${#task} -gt 40 ] && short_task="${short_task}..."
    wezterm cli set-tab-title --pane-id "$pane_id" "$color_name: $short_task"

    # Register shade
    "$SPELLS_DIR/registry.sh" add "$worker_uuid" "$pane_id" "$color_name" "$task" "$project"

    echo "$worker_uuid"
}

cmd_list() {
    wezterm cli list --format json | jq -r '.[] | "\(.tab_title)\t\(.pane_id)\t\(.cwd)"'
}

cmd_kill() {
    local name="$1"

    if [ "$name" = "all" ]; then
        # Kill all shade tabs (not Iris)
        wezterm cli list --format json | jq -r '.[] | select(.tab_title != "Iris") | .pane_id' | while read pane_id; do
            wezterm cli kill-pane --pane-id "$pane_id"
        done
    else
        # Find and kill by name
        local pane_id=$(wezterm cli list --format json | jq -r --arg name "$name" '.[] | select(.tab_title | startswith($name)) | .pane_id')
        if [ -n "$pane_id" ]; then
            wezterm cli kill-pane --pane-id "$pane_id"
        fi
    fi
}

cmd_send() {
    local name="$1"
    shift
    local message="$*"

    local pane_id=$(wezterm cli list --format json | jq -r --arg name "$name" '.[] | select(.tab_title | startswith($name)) | .pane_id')
    if [ -n "$pane_id" ]; then
        wezterm cli send-text --pane-id "$pane_id" --no-paste "$message"
    fi
}

cmd_peek() {
    local name="$1"
    local lines="${2:-30}"

    local pane_id=$(wezterm cli list --format json | jq -r --arg name "$name" '.[] | select(.tab_title | startswith($name)) | .pane_id')
    if [ -n "$pane_id" ]; then
        wezterm cli get-text --pane-id "$pane_id" | tail -"$lines"
    fi
}

# Main dispatch
case "${1:-}" in
    "") cmd_start ;;
    spawn) shift; cmd_spawn "$@" ;;
    status|list) cmd_list ;;
    kill) shift; cmd_kill "$@" ;;
    send) shift; cmd_send "$@" ;;
    peek) shift; cmd_peek "$@" ;;
    *) echo "Unknown command: $1" ;;
esac
```

---

### Phase 3: Registry Updates

The registry system (`spells/registry.sh`) stays mostly the same, but stores WezTerm pane IDs instead of tmux pane IDs.

---

### Phase 4: Title Updates

#### `spells/title-wez.sh`

```bash
#!/bin/bash
# Set shade tab title in WezTerm

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$1" =~ ^[a-z]+-[0-9]{8}-[0-9]{6}-[a-f0-9]{4}$ ]]; then
    UUID="$1"
    shift
    TASK="$*"

    SHADE_JSON=$("$SCRIPT_DIR/registry.sh" get "$UUID")
    PANE_ID=$(echo "$SHADE_JSON" | jq -r '.pane_id')
    NAME=$(echo "$SHADE_JSON" | jq -r '.name')

    SHORT_TASK="${TASK:0:40}"
    [ ${#TASK} -gt 40 ] && SHORT_TASK="${SHORT_TASK}..."

    wezterm cli set-tab-title --pane-id "$PANE_ID" "$NAME: $SHORT_TASK"

    "$SCRIPT_DIR/registry.sh" update "$UUID" "status" "working"
    "$SCRIPT_DIR/registry.sh" update "$UUID" "current_task" "$TASK"
fi
```

---

## Migration Checklist

- [ ] Install WezTerm
- [ ] Create `~/.config/wezterm/wezterm.lua` with Iris config
- [ ] Create `spells/iris-wez.sh` (new CLI)
- [ ] Create `spells/title-wez.sh`
- [ ] Update `IRIS.md` to reference new commands
- [ ] Update `SHADE.md` to use `wezterm cli` for title updates
- [ ] Test spawn/kill/send/peek commands
- [ ] Test tab color styling
- [ ] Remove tmux dependency from spells

---

## Key Limitations to Accept

1. **No per-pane title bars** - Shades identified by tab title only
2. **Single shade visible at a time** (unless using splits without titles)
3. **No remote attach** - WezTerm multiplexing is GUI-bound
4. **Session loss on GUI close** - No detach/reattach like tmux

---

## Alternative: Keep tmux Inside WezTerm

If per-pane titles are essential, run tmux inside WezTerm:
- Get WezTerm's GPU rendering, fonts, ligatures
- Keep tmux's `pane-border-status` for shade identity
- Best of both worlds

This is NOT pure WezTerm but may be the pragmatic choice.

---

## Sources

- [WezTerm CLI Reference](https://wezterm.org/cli/cli/index.html)
- [WezTerm Mux Module](https://wezterm.org/config/lua/wezterm.mux/index.html)
- [WezTerm Pane Methods](https://wezterm.org/config/lua/pane/index.html)
- [WezTerm Colors & Appearance](https://wezterm.org/config/appearance.html)
- [Per-pane background discussion](https://github.com/wez/wezterm/discussions/4744)
- [Pane title feature request](https://github.com/wezterm/wezterm/issues/1970)
- [Theme per pane request](https://github.com/wezterm/wezterm/issues/5330)
