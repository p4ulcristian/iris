# Driving YouTube in Paul's real Chromium (Gaia) — findings

## What's actually on this machine
| Tool | Status | Notes |
|------|--------|-------|
| chromium | ✅ `/usr/bin/chromium` 149.0.7827.53 | the **only** browser; default web browser |
| python3, node, jq, curl | ✅ | all present |
| hyprctl, grim, wtype | ✅ | Wayland/Hyprland window + keystroke control |
| xdg-open, gtk-launch | ✅ | URL launching |
| **xdotool** | ❌ not installed | X11-only — useless here anyway |
| **wmctrl** | ❌ not installed | X11-only — useless here anyway |
| ydotool | ❌ not installed | |

**Session is pure Wayland (Hyprland), no X11.** This is the single most important
fact: `xdotool` and `wmctrl` are X11 tools and **cannot drive Wayland windows even if
installed**. On this box, window/keystroke automation = `hyprctl` (focus) + `wtype`
(typing/keys). That combo is already wrapped in `skills/type-into-window.sh`.

## State of the running browser
- Paul's real, logged-in Chromium **is already running** on the default profile
  `~/.config/chromium` (SingletonLock held by pid 63766, 1Password extension loaded).
- It even has a **YouTube tab open right now** ("Daft Punk - Get Lucky … YouTube").
- It was launched **without** `--remote-debugging-port`.
- Nothing is listening on port 9222.

## The CDP catch (why the existing skill doesn't hit the real profile)
Chrome DevTools Protocol can only be attached to a browser that was **started with**
`--remote-debugging-port`. You **cannot** turn the port on for an already-running
instance. Paul's real browser didn't open the port, so CDP can't touch it.

Also, only one Chromium can hold a profile's `--user-data-dir` lock at a time. So you
can't "launch a second debug Chromium on `~/.config/chromium`" while the real one runs —
the profile is locked.

This is exactly what the current `skills/play-youtube.sh` runs into: it launches a
**separate** Chromium on a **throwaway profile** (`~/.config/iris-chrome-debug`). That
gives clean CDP autoplay control, **but it is NOT Paul's logged-in session** — it's a
fresh, signed-out profile. That's both a) not what this task wants, and b) the profile
**most likely to trip YouTube's "sign in to confirm you're not a bot"** wall, since
unauthenticated/fresh profiles are exactly what those checks target.

## Recommended approach (most reliable, in Paul's real browser)

### 1) Open a YouTube URL in the existing logged-in browser — use `xdg-open`
```bash
xdg-open "https://www.youtube.com/watch?v=VIDEO_ID"
# or equivalently: chromium "https://...."
```
Because Chromium is the default browser and an instance is already running, this routes
the URL through Chromium's singleton socket and opens it as a **new tab in the real
`~/.config/chromium` profile** — fully logged in, no new window, no separate profile.
No bot checks, because it's a normal authenticated session. This is the single most
reliable open path on this machine.

(Worker runs from a tty, so export the desktop session first — same discovery the
existing skills do: set `XDG_RUNTIME_DIR`, find `wayland-*` → `WAYLAND_DISPLAY`, pick
the newest dir under `$XDG_RUNTIME_DIR/hypr` → `HYPRLAND_INSTANCE_SIGNATURE`.)

### 2) Make it actually play — focus the window + send a key with hyprctl/wtype
A freshly opened YouTube watch tab usually autoplays; when it doesn't (no user-gesture),
the reliable nudge is a real keystroke into the focused tab — YouTube treats `k`/space
as play/pause:
```bash
addr=$(hyprctl clients -j | jq -r '.[] | select(.title|test("YouTube")) | .address' | head -1)
hyprctl dispatch hl.dsp.focus "$addr"   # focus the YouTube window
sleep 0.3
wtype -k k                              # 'k' = play/pause in the YouTube player
```
This is essentially `skills/type-into-window.sh` minus the Enter. Because the keypress
is a genuine input event (not a synthetic JS `.play()`), it satisfies the gesture
requirement and isn't blocked.

## Verdict / ranking
1. **Best — `xdg-open` into the running profile + `hyprctl`-focus & `wtype -k k` to
   play.** Real logged-in session, no bot checks, uses only installed tools, minimally
   disruptive. Recommended default.
2. **CDP on the real profile** — only possible if you fully **quit** Chromium and
   relaunch it with `--remote-debugging-port=9222 --user-data-dir=~/.config/chromium`.
   Gives scriptable autoplay/unmute/seek on the *real* logged-in session and is robust,
   but it kills and reopens Paul's whole browser — disruptive, do only if he wants
   programmatic control beyond "play this".
3. **Current `play-youtube.sh` (separate debug profile + CDP)** — cleanest autoplay,
   but signed-out throwaway profile → most exposed to bot checks and not the real
   session. Fine for "just play *some* music in any window", wrong for "in my browser".
4. **xdotool / wmctrl** — N/A. X11 tools on a Wayland box; not installed, wouldn't work.

## Suggested improvement to the skill set
Add an `open-youtube-here.sh` that does approach #1 (xdg-open + hyprctl focus +
`wtype -k k`) so iris can play YouTube **in Paul's logged-in Chromium** without spawning
the throwaway-profile debug browser. Keep the CDP `play-youtube.sh` as the fallback for
headless-ish "play anything" cases.
