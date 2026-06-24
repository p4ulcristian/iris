# Camoufox on Gaia — setup report & how iris should use it

**Status: working.** Installed and smoke-tested 2026-06-24. A headless launch
opened `https://youtube.com`, read the title ("YouTube"), and hit **no bot
detection / captcha wall**.

## What Camoufox is
A hardened, anti-fingerprint fork of Firefox driven through **Playwright**. You
script it in Python like normal Playwright, but the browser masks the usual
automation tells (navigator props, canvas/WebGL noise, fonts, etc.), so sites
like YouTube treat it as a real user.

## What got installed
- Python 3.14 + pip were already present.
- Arch/PEP-668 blocks system-wide pip, so Camoufox lives in a **dedicated venv**:
  `~/work/iris/skills/camoufox-venv/`
- Package: `camoufox[geoip]` 0.4.11 (pulls Playwright 1.60).
- Browser binary fetched via `python -m camoufox fetch` → cached in
  `~/.cache/camoufox` (707 MB, ARM64 build for Asahi).
- Runtime deps (gtk3, libxcb, alsa-lib) were already installed.

### Run anything with the venv python
```
~/work/iris/skills/camoufox-venv/bin/python  <script.py>
```

### Smoke test
```
~/work/iris/skills/camoufox-venv/bin/python ~/work/iris/skills/browser-test.py
# add --headed to watch it, --url <u> for another page
```

## Headless note (important on this machine)
- Use `headless=True` — **native** Firefox headless, no extra packages.
- Do **not** use `headless="virtual"` unless you `sudo pacman -S xorg-server-xvfb`
  first; that mode needs Xvfb and currently raises `CannotFindXvfb`.
- `--headed` works too (renders via Xwayland on Hyprland) if Paul wants to watch.

## Profiles & logged-in sessions — the key question

**Can we attach to Paul's existing logged-in Chrome/Firefox profile?**
No, not safely. Camoufox is a *custom Firefox build*; you can't point it at the
running Chrome profile (different engine) or at Paul's live Firefox profile
(locked while in use, and a different browser version → corruption risk). The
`play-youtube` skills use Chrome's debug port for exactly that reason.

**The right model: Camoufox gets its OWN persistent profile, logged in once.**
- `browser-test.py` already does this: `persistent_context=True` +
  `user_data_dir=~/work/iris/skills/camoufox-profile`.
- Cookies/localStorage/login survive across runs in that dir.
- **One-time login:** run it headed, sign into YouTube/Google by hand once:
  ```
  ~/work/iris/skills/camoufox-venv/bin/python ~/work/iris/skills/browser-test.py \
      --headed --url https://accounts.google.com
  ```
  After that, every headless run reuses the session — `browser-test.py` prints
  `appears signed in: True` once it's done.
- Caveat: Google sometimes challenges a *first* login from a fresh
  fingerprint. Camoufox's stealth makes this far less likely than vanilla
  Playwright, but if it asks, complete the challenge once in the headed window
  and it's remembered.

## Minimal pattern for new iris automations
```python
from camoufox.sync_api import Camoufox
PROFILE = "/home/paul/work/iris/skills/camoufox-profile"
with Camoufox(headless=True, os="linux", humanize=True,
              persistent_context=True, user_data_dir=PROFILE) as ctx:
    page = ctx.new_page()
    page.goto("https://youtube.com")
    ...
```

## Recommendation for iris
- Use Camoufox when a task needs a **logged-in** session or must dodge bot
  detection (YouTube account actions, scraping behind a login, form fills).
- Keep using the lightweight `play-youtube` Chrome-debug skills for simple
  "just play this video" requests — they're faster and need no profile.
- Maintain the single shared profile at `camoufox-profile/`; log in once headed,
  then drive it headless.

## Headful (`headless=False`) gotchas on Gaia — fixed 2026-06-24

Driving Camoufox **headful** from a background worker shell needs two fixes:

1. **Wayland display env.** The worker's shell has empty `WAYLAND_DISPLAY`/`DISPLAY`,
   so a headful launch dies with *"launched a headed browser without an XServer"*.
   Export the compositor's env before launching:
   ```
   WAYLAND_DISPLAY=wayland-1 XDG_RUNTIME_DIR=/run/user/1000 MOZ_ENABLE_WAYLAND=1 \
       ~/work/iris/skills/camoufox-venv/bin/python <script.py>
   ```
   (Same reason `hyprctl` returns nothing from the worker — export
   `HYPRLAND_INSTANCE_SIGNATURE=$(ls $XDG_RUNTIME_DIR/hypr | head -1)` first.)

2. **Playwright Firefox-driver crash on YouTube watch pages.** Playwright 1.60's
   bundled driver does `pageError.location.url` unconditionally; YouTube fires an
   uncaught error whose `location` is undefined, crashing the whole Node driver
   (`TypeError: Cannot read properties of undefined (reading 'url')`). Patched the
   vendored bundle (backup at `coreBundle.js.bak`) — both occurrences of the
   PageError dispatch now use optional chaining + fallbacks:
   ```
   url: pageError.location?.url || '', line: …?.lineNumber || 0, column: …?.columnNumber || 0
   ```
   File: `camoufox-venv/lib/python3.14/site-packages/playwright/driver/package/lib/coreBundle.js`
   Re-apply if camoufox/Playwright is reinstalled.

Note: an automated load autoplays the video **muted** (browser autoplay policy),
so no Firefox/Camoufox PipeWire sink-input appears until the tab is unmuted.
