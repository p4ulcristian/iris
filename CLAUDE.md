# iris (project notes for Claude)

This repo is **iris-talk** — a voice companion for Paul's Hyprland desktop on
`home`. The single script `iris-talk` orchestrates STT → context → brain → TTS.
See `README.md` for the full picture.

When you are invoked as iris's **brain** (via `claude -p` from this dir), your
reply is read aloud by TTS — so keep it short, spoken, no markdown. That
behaviour is enforced by the `PERSONA` system prompt in `iris-talk`; this note
just records why a terse, voice-shaped answer is correct here.

Repo layout:
- `brain/` — iris's executable mind & hands: `iris-brain` (front desk, runs on
  Olympus) and `iris-worker` (background agent, runs on Gaia). Also `iris-panel`
  (the port-4270 web panel on Gaia: `/event` `/stream` `/chat` `/say` `/usage`
  `/workers` `/workers/cleanup`) and `usage-tracker.py` (scrapes
  `~/.claude/projects/` JSONL for token+cost). `brain/workers.json` is the live
  worker registry (gitignored runtime state).
- `personality/` — canonical, human-readable persona prompts (`persona.md`). The
  live copies are embedded in the `brain/` scripts; keep the two in sync.
- `memories/` — durable long-term facts iris carries between conversations.
- `skills/` — reusable shell helpers the worker runs (see `skills/README.md`).
- `scripts/` — ops: `deploy.sh`, `health-check.sh`, `rollback.sh`, `status-loop.sh`.
- `config/` — credentials (e.g. `telegram.env`); never commit secrets that aren't
  already tracked.

Key facts:
- Brain = Claude Code print mode (`claude -p --resume`), not the API.
- Voice endpoints come from the `iris-stt` repo on `10.99.0.2:4260`.
- Desktop wiring (waybar eye, `Super+I`) is persisted in the `system-config` repo,
  not here — edit role templates there, not the deployed files.

Multi-worker (v1.0):
- iris runs numbered workers (`worker-1`, `worker-2`, …) in PARALLEL. Each is an
  independent `claude -p` session with its own task, identity, and conversation.
- `iris-worker dispatch "<task>" [cwd] [-w N]` — `-w` targets a worker; omit it to
  auto-assign the next free slot (busy workers are NOT interrupted). Also:
  `stop [-w N | --all]`, `status [-w N]`, `workers`, `cleanup [--force]`.
- The front-desk JSON gained an optional `worker` field for dispatch/stop targeting.
- Registry: `brain/workers.json` (override `IRIS_WORKERS_JSON`), locked
  read-modify-write so parallel workers don't clobber it; per-worker pid/session
  files live under `~/.cache/iris-talk/workers/`. worker-1 is mirrored to the
  legacy `~/.cache/iris-talk/worker.json` for older readers.
- Cleanup: workers idle >10 min are retired; ones still holding a session
  (history) are kept and surfaced for confirmation unless `--force`. The panel
  sweeps every `IRIS_WORKER_SWEEP` seconds (default 120) and posts a note iris
  can act on ("stop worker N").

Hyprland tools:
- Use `hyprctl` freely and automatically to enrich context — it's read-only and safe.
- Proactively query monitors (`hyprctl monitors`), workspaces (`hyprctl workspaces`),
  and active window (`hyprctl activewindow`) when it helps answer the question.
- Capture screenshots of other monitors with `grim -o <output> <path>` if Paul asks
  about what's on another screen.
