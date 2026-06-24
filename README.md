# iris-talk

A spoken voice companion that watches the Hyprland desktop on **home** and talks
back. It closes the loop the existing `iris` voice layer left open: the
[`iris`](../system-config/roles/iris) role gave us ears (CapsLock dictation) and
a mouth (`iris-say`); `iris-talk` adds the **brain** and the **eyes**.

## Loop

```
you speak ─▶ STT (iris-comms /stt/transcribe, Parakeet)
          ─▶ gather context:
               • active window (hyprctl): class / title / workspace
               • focused terminal's cwd  (walk the pid's process tree)
               • git state of that cwd   (branch / dirty / last commit)
               • your LIVE Claude Code session (tail ~/.claude/projects/<cwd>)
               • a screenshot of the focused monitor (grim, read on demand)
          ─▶ think  (Claude via `claude -p`, conversation kept with --resume)
          ─▶ speak  (iris-say ─▶ iris-comms /tts/stream, Orpheus)
```

The brain is your **Claude Code subscription** in print mode — no API key, and it
gets vision + file reading for free. It runs from a fixed cwd (`~/work/iris`) so
iris's own session transcripts never pollute your project folders.

## Controls

- **Super + I** — tap to start listening, tap again to send + hear the reply.
- **waybar eye** 👁 — shows state (idle / listening / thinking / speaking):
  - left-click  → chat-history popup (floating window)
  - right-click → toggle (same as Super + I)
  - middle-click → reset the conversation (fresh context)

## CLI

```
iris-talk            toggle (default)
iris-talk start|stop|cancel
iris-talk waybar     # JSON for the waybar module
iris-talk history    # print the transcript
iris-talk history-popup
iris-talk reset      # forget the conversation
iris-talk --text "…" # skip the mic; feed text straight to the brain (debug)
```

## Config (env)

| var | default | meaning |
|-----|---------|---------|
| `IRIS_MODEL` | `sonnet` | brain model; `opus` for harder questions, `""` for the CC default |
| `IRIS_PTT_SOURCE` | `effect_output.j413-mic` | mic source (Mac built-in DSP) |
| `IRIS_PTT_ENDPOINT` | `http://10.99.0.2:4260/stt/transcribe` | STT |
| `IRIS_BRAIN_TIMEOUT` | `120` | seconds before the brain call is abandoned |

Auth + endpoints are shared with `iris-ptt` (`~/.config/iris-ptt/api_key`).
State lives in `~/.cache/iris-talk/` (session id, history, screenshot, state).

## Install / where things live

- The script is symlinked into PATH: `~/.local/bin/iris-talk -> ~/work/iris/iris-talk`.
- Desktop wiring lives in **system-config** (so it survives a reprovision):
  - `roles/waybar/files/{config,style.css}` — the eye module + states
  - `roles/hyprland/templates/hyprland.lua.j2` — `Super+I` bind + popup float rule
- The voice endpoints are served by the **iris-stt** repo (`~/work/iris-stt`) on
  the iris-comms box (`10.99.0.2:4260`).

## Roadmap

- **Phase 1 (done):** push-to-talk-style toggle, context watcher, waybar eye + history.
- **Phase 2:** hands-free — VAD endpointing, multi-turn sessions, barge-in.
- **Phase 3:** wake word ("hey iris") to enter a hands-free session.
