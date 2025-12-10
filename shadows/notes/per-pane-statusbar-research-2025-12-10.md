# Per-Pane Status Bar Research

Research into modern solutions for giving each worker pane its own status bar.

## Options Compared

### 1. tmux pane-border-status (Built-in)

**What it is:** Since tmux 2.3, there's a native `pane-border-format` feature that displays per-pane text in the top or bottom border of each pane.

**Configuration:**
```bash
set -g pane-border-status top
set -g pane-border-format "#{pane_index} #{pane_title}"
```

**Setting pane titles:**
- Escape sequence: `printf '\033]2;%s\033\\' 'My Pane Title'`
- Command: `tmux select-pane -T "title"`
- Keybinding: `bind T command-prompt -p "Pane title:" "select-pane -T '%%'"`
- User options (tmux 3.0+): `set -p @myname name1` then use `#{@myname}` in format

**Pros:**
- Zero additional complexity - pure tmux
- No keybinding conflicts
- Already integrated with current workflow
- Lightweight, no extra processes
- Can show dynamic info (git status, path, command, etc.)

**Cons:**
- Limited to the pane border line
- `pane-border-format` is a **window option**, not a pane option (can't set different formats per pane)
- Styling is global (same colors for all panes unless using conditionals)
- Less visually prominent than a full status bar

**Important caveat:** While the format string is window-level, pane **user options** (`@shade_name`, `@shade_status`) are truly per-pane and can be interpolated into the format string.

**Verdict:** Best option for Iris. Simple, native, no conflicts.

---

### 2. Nested tmux Sessions

**What it is:** Running a separate tmux session inside each pane, so each has its own independent status bar.

**How it works:**
- Each pane spawns its own tmux session with `unset TMUX && tmux new-session`
- Different prefix keys for outer vs inner (e.g., `C-b` outer, `C-a` inner)
- Toggle mode to "pass through" to inner session

**Configuration for nested mode:**
```bash
bind -n M-Z { set status; set key-table nested; set prefix None }
bind -T nested M-Z { set status; set key-table root; set prefix C-z }
```

**Pros:**
- Full status bar per pane with all tmux features
- Complete isolation between sessions
- Each session can have different configurations

**Cons:**
- Significant complexity managing nested sessions
- Keybinding conflicts require careful configuration
- Multiple tmux processes (resource overhead)
- Confusing mental model (which level am I in?)
- Harder to script and automate
- tmux warns "sessions should be nested with care"

**Verdict:** Overcomplicated. Solves more than needed, introduces confusion.

---

### 3. Zellij (Replace tmux)

**What it is:** A modern Rust-based terminal multiplexer designed for better UX.

**Key features:**
- Built-in keybinding hints at bottom of screen
- Context-aware UI that shows available actions
- Native layouts defined in KDL config format
- Plugin system using WebAssembly
- tmux compatibility mode for familiar keybindings

**Pros:**
- Beginner-friendly with visible keybindings
- Beautiful default appearance
- Modern plugin architecture
- Session restoration works automatically
- Layouts are declarative and easier than bash scripts

**Cons:**
- Large binary (38MB vs tmux's 900KB)
- Less mature (first release 2021)
- Smaller ecosystem
- Would require rewriting all Iris tooling
- Current workflow heavily invested in tmux
- Mouse scroll requires extra keystroke (Ctrl-s)

**Verdict:** Compelling alternative but migration cost is too high. Would require rewriting spells, hooks, and workflows.

---

### 4. Zellij Inside tmux Panes

**What it is:** Running Zellij as the shell inside each tmux pane.

**Pros:**
- Each pane gets Zellij's full UI including status bar
- Could theoretically work

**Cons:**
- Keybinding conflicts between tmux and Zellij
- Double multiplexer overhead
- Confusing user experience
- No clear documentation on this pattern
- Worst of both worlds complexity

**Verdict:** Not recommended. Compounding complexity without clear benefits.

---

### 5. WezTerm (Terminal with Built-in Multiplexing)

**What it is:** GPU-accelerated terminal emulator with native multiplexing.

**Features:**
- Built-in pane splitting and tabs
- Lua-based configuration
- Workspaces for session management
- Better scrollback and mouse handling than tmux

**Per-pane status:**
- Currently no per-pane status bar (requested Oct 2024, Issue #6241)
- Has global right-status bar

**Pros:**
- Integrated experience (terminal + multiplexer)
- Better performance than tmux
- Individual scrollback per pane
- Active development

**Cons:**
- No per-pane status bar (the key feature we need)
- Requires switching terminal emulator
- Complete workflow change

**Verdict:** Interesting but doesn't solve the specific problem yet.

---

### 6. Kitty Terminal

**What it is:** Fast, GPU-based terminal with built-in multiplexing.

**Features:**
- Tabs and windows (their term for panes)
- Multiple layouts including splits
- Remote control via IPC
- Extensible via "kittens" (Python plugins)

**Kitty's position:** "Terminal multiplexers are a bad idea... kitty contains features that do all of what tmux does, but better, with the exception of remote persistence."

**Pros:**
- Fast and modern
- Good tab bar customization
- Native window management

**Cons:**
- No per-pane status bar equivalent
- No remote persistence (deal breaker for some workflows)
- Would require terminal emulator change

**Verdict:** Not suitable - lacks the specific feature and remote persistence.

---

### 7. Byobu (tmux/screen wrapper)

**What it is:** A wrapper around tmux or screen that adds user-friendly defaults and a rich status bar.

**Features:**
- Pre-configured status bar with system info (CPU, memory, date/time)
- Easy toggle of status notifications via F9 menu
- Custom status scripts in `$BYOBU_CONFIG_DIR/bin`
- Works on top of tmux with enhanced defaults

**Per-pane support:**
- Byobu's status bar is global, not per-pane
- Still relies on underlying tmux's `pane-border-status` for per-pane info

**Pros:**
- Easy to use out of the box
- Good system monitoring built-in
- F-key shortcuts for common operations

**Cons:**
- Adds abstraction layer over tmux
- Per-pane status still requires tmux configuration
- Less control than raw tmux

**Verdict:** Doesn't add per-pane capability. Just a wrapper with nice defaults.

---

## Recommendation

**Use tmux pane-border-status** - it's the clear winner for Iris.

### Why:
1. **Zero migration cost** - Already using tmux
2. **No keybinding conflicts** - Pure native feature
3. **Lightweight** - No extra processes
4. **Sufficient for the use case** - Shows shade name, status, task

### Suggested Implementation:

```bash
# In tmux config or dynamically per-session
set -g pane-border-status top
set -g pane-border-format " #[fg=colour214]#{@shade_name}#[default] │ #{@shade_status} │ #{@shade_task} "
```

When spawning a shade:
```bash
tmux set -p @shade_name "Amber"
tmux set -p @shade_status "laboring"
tmux set -p @shade_task "Researching status bars"
```

Update dynamically:
```bash
tmux set -p -t "$PANE_ID" @shade_status "fulfilled"
```

### Visual Appearance

The pane border becomes a thin status line at the top (or bottom) of each pane showing:
```
┌─ Amber │ laboring │ Researching status bars ─────────────────────┐
│                                                                   │
│  [pane content here]                                             │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

This integrates naturally with tmux's existing visual language and requires minimal changes to the current Iris setup.

---

## Sources

- [Nested tmux sessions](https://www.bomberbot.com/tech/tmux-in-practice-mastering-local-and-nested-remote-sessions/)
- [Nested mode toggle (2025)](https://demu.red/blog/2025/10/adding-a-nested-session-mode-to-tmux-and-misc-extras/)
- [Zellij vs Tmux comparison](https://typecraft.dev/tutorial/zellij-vs-tmux)
- [Switching from Tmux to Zellij (March 2025)](https://bulimov.me/post/2025/03/22/tmux-zellij/)
- [Zellij over Tmux (Dec 2024)](https://www.morelightmorelight.com/2024/12/15/zellij-over-tmux/)
- [tmux pane-border-format commit](https://github.com/tmux/tmux/commit/0509be07404a4f4626bbdab56d858f657dc68604)
- [Git statuses in tmux panes](https://www.markneuburger.com/git-statuses-in-tmux-panes/)
- [WezTerm multiplexing](https://wezterm.org/multiplexing.html)
- [WezTerm pane status request](https://github.com/wezterm/wezterm/issues/6241)
- [Session management in WezTerm](https://fredrikaverpil.github.io/blog/2024/10/20/session-management-in-wezterm-without-tmux/)
- [Kitty overview](https://sw.kovidgoyal.net/kitty/overview/)
- [Kitty FAQ on multiplexers](https://sw.kovidgoyal.net/kitty/faq/)
- [pane-border-format is a window option](https://github.com/tmux/tmux/issues/2999)
- [Byobu Community Help Wiki](https://help.ubuntu.com/community/Byobu)
- [awesome-tmux resource list](https://github.com/rothgar/awesome-tmux)
- [Slant: Best terminal multiplexers 2025](https://www.slant.co/topics/4018/~terminal-multiplexers)
