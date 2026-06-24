#!/usr/bin/env bash
# health-check.sh — verify that iris is healthy.
#
#   exit 0  -> healthy   (safe to keep an update)
#   exit !=0 -> unhealthy (deploy.sh will roll the update back)
#
# Hard checks (any failure => unhealthy) target the things a bad `git pull` can
# actually break: the repo state and the integrity of iris's code. Process
# checks are reported as warnings only — deploy.sh (re)starts services *after*
# this check passes, so a service that isn't up yet must not trigger a rollback.

set -uo pipefail

IRIS_DIR="$HOME/work/iris"
cd "$IRIS_DIR" 2>/dev/null || { echo "[health] FAIL: $IRIS_DIR does not exist"; exit 1; }

fail=0
ok()   { echo "[health] OK:   $*"; }
bad()  { echo "[health] FAIL: $*"; fail=1; }
warn() { echo "[health] WARN: $*"; }

# 1. git repo present
if git rev-parse --git-dir >/dev/null 2>&1; then
  ok "git repository present"
else
  bad "$IRIS_DIR is not a git repository"
fi

# 2. working tree clean — ignoring VERSION, which deploy.sh bumps on purpose
#    before calling this script.
dirty="$(git status --porcelain 2>/dev/null | grep -vE 'VERSION$' || true)"
if [ -z "$dirty" ]; then
  ok "working tree clean (VERSION change ignored)"
else
  bad "unexpected uncommitted changes:"
  echo "$dirty"
fi

# 3. VERSION is a positive integer
ver="$(cat VERSION 2>/dev/null || true)"
if [[ "$ver" =~ ^[0-9]+$ ]]; then
  ok "VERSION is a valid integer ($ver)"
else
  bad "VERSION is not a positive integer: '$ver'"
fi

# 4. core entry scripts exist and compile (catches a broken pull)
for f in iris-brain iris-worker; do
  if [ -f "$f" ]; then
    if python3 -m py_compile "$f" 2>/dev/null; then
      ok "$f compiles"
    else
      bad "$f has Python syntax errors"
    fi
  else
    bad "$f is missing"
  fi
done

# 5. process / service checks — informational only (warnings never fail).
if pgrep -f 'telegram-bridge' >/dev/null 2>&1; then
  ok "telegram bridge is running"
else
  warn "telegram bridge is not running"
fi

if pgrep -f 'iris-comms' >/dev/null 2>&1 || pgrep -f 'iris-worker' >/dev/null 2>&1; then
  ok "an iris service is running"
else
  warn "no iris service detected (will be started after deploy)"
fi

if [ "$fail" -eq 0 ]; then
  echo "[health] healthy"
else
  echo "[health] UNHEALTHY"
fi
exit "$fail"
