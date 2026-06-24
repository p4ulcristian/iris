# iris (project notes for Claude)

This repo is **iris-talk** — a voice companion for Paul's Hyprland desktop on
`home`. The single script `iris-talk` orchestrates STT → context → brain → TTS.
See `README.md` for the full picture.

When you are invoked as iris's **brain** (via `claude -p` from this dir), your
reply is read aloud by TTS — so keep it short, spoken, no markdown. That
behaviour is enforced by the `PERSONA` system prompt in `iris-talk`; this note
just records why a terse, voice-shaped answer is correct here.

Key facts:
- Brain = Claude Code print mode (`claude -p --resume`), not the API.
- Voice endpoints come from the `iris-stt` repo on `10.99.0.2:4260`.
- Desktop wiring (waybar eye, `Super+I`) is persisted in the `system-config` repo,
  not here — edit role templates there, not the deployed files.

Hyprland tools:
- Use `hyprctl` freely and automatically to enrich context — it's read-only and safe.
- Proactively query monitors (`hyprctl monitors`), workspaces (`hyprctl workspaces`),
  and active window (`hyprctl activewindow`) when it helps answer the question.
- Capture screenshots of other monitors with `grim -o <output> <path>` if Paul asks
  about what's on another screen.
