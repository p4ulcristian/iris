# iris skills

Reusable shell helpers iris's **worker** can run to drive Gaia's desktop.

**This README is the manifest.** iris loads it on every task, picks a matching
skill, and prefers running it over reinventing the action by hand.

## How iris uses a skill
Run it with bash:

```
bash ~/work/iris/skills/<script> <args>
```

## How to add a skill
1. Drop an executable script in this folder (`chmod +x`).
2. Add a bullet under **Available skills** with its name, args, and one-line
   description. That's it — iris reads this list next task.

## Available skills

### Browser tabs (Chrome DevTools, port 9222)

These four drive an **already-running** Chrome/Chromium that was started with
`--remote-debugging-port=9222 --remote-allow-origins=*`. They share a tiny
stdlib-only DevTools helper, `cdp.py` (no third-party packages). Override the
host/port with the `CDP_HOST` / `CDP_PORT` env vars.

- **list-tabs.sh** `[--json]` — list every open Chrome tab as
  `<title>  ->  <url>` (or raw JSON with `--json`). Curls
  `http://localhost:9222/json` and keeps only real page tabs. Needs `curl`, `jq`.

- **read-tab.sh** `<url-pattern-or-title>` — extract the visible text of the
  first tab whose title or URL contains the pattern (case-insensitive), by
  evaluating `document.body.innerText` over the DevTools websocket. Prints the
  rendered page text. Needs `curl`, `python3` (`cdp.py`).

- **send-to-tab.sh** `<url-pattern-or-title> <message>` — find the matching tab,
  locate its chat/input box (focused contenteditable, else bottom-most
  `<textarea>` / text input), fill it with `<message>` using framework-friendly
  input events, and send it (clicks a send button, else presses Enter). Needs
  `curl`, `jq`, `python3` (`cdp.py`).

- **play-youtube-cdp.sh** `<youtube-url | video-id | search terms>` — play a
  YouTube video in the already-running browser; see the full entry below.

- **cdp.py** — shared DevTools helper used by the skills above (`cdp.py tabs`,
  `cdp.py eval <pattern> <js>`). Minimal RFC6455 websocket client in pure
  stdlib; not usually called directly.

### Desktop & media

- **type-into-window.sh** `<window-address> <string>` — focus a Hyprland window
  (via the `hl.dsp.focus` Lua API), type the string with `wtype`, press Enter.

- **play-youtube.sh** `[youtube-url | video-id | search terms]` — open Chrome
  (or Chromium) with remote debugging on port 9222 (launching it if needed),
  open the requested YouTube URL, and force autoplay via the DevTools protocol.
  With no argument it plays a default music video; a bare 11-char id becomes a
  watch URL; free text becomes a search.

- **play-youtube-cdp.sh** `<youtube-url | video-id | search terms>` — play a
  video by driving an **already-running** Chromium via the DevTools Protocol
  (port 9222). Finds the open YouTube tab through `http://localhost:9222/json`
  and **navigates that same tab** to the video (`Page.navigate` over a pure-bash
  websocket — no Python); opens a new tab only if none exists, then forces
  autoplay (unmute + play). A bare 11-char id becomes a watch URL; free text
  becomes a search. **Requirement:** Chromium must already be running with
  `--remote-debugging-port=9222 --remote-allow-origins=*` — this script does
  *not* launch the browser (use `play-youtube.sh` for that). Needs `curl` + `jq`.

- **test-play-youtube.sh** `[same args as play-youtube]` — run `play-youtube.sh`
  then verify via the DevTools API that the debug endpoint is live and a YouTube
  tab is open. Use it to sanity-check the skill.

- **youtube-player/** — a self-contained YouTube player webapp iris can control.
  A tiny local server (`server.py`, default port 8745) serves a full-page,
  dark, chrome-free IFrame-API player and exposes a REST API; the page polls
  the server for commands. Use it when you want a dedicated, controllable
  player window rather than a normal browser tab.
  - **youtube-player/play-youtube.sh** `<youtube-url | video-id>` — extract the
    video id, start the server + Chromium app window if not already running
    (via `start.sh`), then call `/play` to load and play the video. This is the
    main entry point.
  - **youtube-player/start.sh** — launch the server and open Chromium in app
    mode (`--app=http://localhost:8745 --window-size=800,600`). Idempotent.
  - REST API (all `GET`): `/play?v=VIDEO_ID`, `/pause`, `/resume`, `/stop`.
    Override the port with the `IRIS_YT_PORT` env var.

- **play-camoufox-yt.py** — minimal headful Camoufox script: opens a YouTube
  watch URL in the shared `camoufox-profile/` and holds the window open ~60s.
  Run with the venv python. **Two gotchas on Gaia (both handled in
  camoufox-report.md):** (1) headful needs the Wayland env exported —
  `WAYLAND_DISPLAY=wayland-1 XDG_RUNTIME_DIR=/run/user/1000 MOZ_ENABLE_WAYLAND=1`
  — or it dies with "no XServer"; (2) the bundled Playwright 1.60 Firefox driver
  crashes on YouTube watch pages (`pageError.location` undefined) until the
  coreBundle.js patch is applied.

- **browser-test.py** + **camoufox-venv/** — stealth browser automation via
  [Camoufox](https://camoufox.com) (anti-fingerprint Firefox driven by
  Playwright). Use it when a task needs a **logged-in** session or must avoid
  bot detection. Run scripts with the dedicated venv python:
  `~/work/iris/skills/camoufox-venv/bin/python <script.py>`. The smoke test
  `camoufox-venv/bin/python browser-test.py [--headed] [--url U]` launches
  Camoufox, opens YouTube, and prints the title. Camoufox uses its **own**
  persistent profile at `camoufox-profile/` (log in once with `--headed`, then
  drive it headless) — it cannot attach to Chrome's profile. Full notes,
  including the one-time login flow, in **camoufox-report.md**.

### Telegram (bot @irishelpsme_bot)

A two-way bridge between Paul's Telegram and iris, using **curl + jq only**
(python-telegram-bot is not installed and isn't needed). Credentials live in
`~/work/iris/config/telegram.env` (`TELEGRAM_BOT_TOKEN`, mode 600); Paul's chat
ID is learned at runtime and cached in `~/work/iris/config/telegram-chat-id`.

**First-time setup:** Paul sends `/start` to **@irishelpsme_bot** while the
listener is running — that teaches the listener his chat ID and unlocks
outbound messaging.

- **telegram.sh** `<message…>` (or piped on stdin) — send a Telegram message to
  Paul. Reads the token from `config/telegram.env` and the chat ID from
  `config/telegram-chat-id`. Fails with a clear hint if Paul hasn't sent
  `/start` yet. Needs `curl`, `jq`.

- **telegram-bridge.py** — the **bidirectional** bridge (preferred; supersedes
  the inbound-only `telegram-listener.sh`). Pure stdlib Python, two threads:
  - *inbound* long-polls `getUpdates` (30s) and POSTs each incoming Telegram
    text to the panel's `POST /chat` (`http://127.0.0.1:4270`, override with
    `IRIS_PANEL_URL`) — exactly like the panel text box. Records the sender's
    chat ID on first contact, replies to `/start`, persists the update offset in
    `~/.cache/iris-talk/telegram-offset`.
  - *outbound* subscribes to the panel's `GET /stream` SSE feed and relays every
    iris **reply** event back to Telegram. Because *every* turn — voice or
    typed — emits `{"type":"reply"}` to the panel, this one hook covers voice
    replies, panel-typed replies, and answers to Telegram messages alike. The
    reply to a Telegram message arrives "for free" via this path. (Worker-lane
    chatter is skipped; the backlog replayed on connect is skipped via a short
    grace window.)

  Run: `python3 ~/work/iris/skills/telegram-bridge.py`, or install
  **iris-telegram-bridge.service** (`systemctl --user enable --now iris-telegram-bridge`).
  Don't run it alongside `telegram-listener.sh` — two `getUpdates` pollers steal
  each other's updates.

- **iris-telegram-bridge.service** — systemd **user** unit for the bidirectional
  bridge, `Restart=always`, ordered after `iris-panel.service`. Installed at
  `~/.config/systemd/user/iris-telegram-bridge.service`.

- **telegram-listener.sh** *(legacy, inbound-only)* — long-polls `getUpdates`
  and forwards incoming messages to `POST /chat`, but does **not** relay iris's
  replies back. Kept for reference; prefer **telegram-bridge.py**.

- **iris-telegram-listener.service** — systemd **user** unit for the legacy
  listener. Don't enable it at the same time as `iris-telegram-bridge.service`.
