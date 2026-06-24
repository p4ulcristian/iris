# iris implementation plan — multi-worker & idle compact

## 1. Multiple numbered workers (worker-1, worker-2, …)

**Spawn**
- Worker = one `claude -p --resume <session>` lane bound to its own session id.
- Add a worker registry (e.g. `~/.cache/iris-talk/workers/worker-N.json`) holding: id, session id, status, current task, last-active timestamp.
- `iris worker spawn` allocates the next free N, creates the session, writes the registry entry, marks `idle`.
- Workers run as independent processes/lanes so they execute in parallel.

**Identity**
- Each worker has a stable label `worker-N` and its own Claude session — context never crosses lanes.
- Persona/system prompt is parameterized with the worker's number so it knows who it is.

**Routing (iris → worker)**
- iris parses target from the request ("worker 2, …"); default to the least-busy `idle` worker, else spawn one.
- Route by writing the task to that worker's lane/queue; reply events tag `worker-N` so the panel and TTS can attribute them.
- Keep existing single-worker path as `worker-1` for backward compatibility.

**Panel**
- Panel reads the worker registry and renders one row per worker: id, status (idle/working/compacting), current task, last-active.
- SSE `/stream` events carry a `worker` field so each row updates live.

## 2. Worker auto-compact on idle

**Idle detection**
- A worker is idle when its registry status is `idle` and `now - last_active` exceeds a threshold (e.g. 2 min) with no queued task.
- A lightweight supervisor (panel loop or small timer) scans the registry on an interval.

**What "compact" means**
- Run Claude Code's `/compact` on the worker's session to summarize+trim its context, keeping it lean for the next task.
- Fallback: trim/rotate the session transcript if `/compact` is unavailable.
- Mark status `compacting` while it runs; never compact a worker with an active task.

**Cadence**
- Trigger once per idle period (after the idle threshold), not repeatedly.
- Re-arm only after the worker does new work and goes idle again.
- Skip if the context is already small (below a token/size floor) to avoid needless churn.
