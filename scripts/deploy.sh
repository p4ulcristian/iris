#!/usr/bin/env bash
# deploy.sh — iris self-update pipeline with automatic rollback.
#
# Flow:
#   a) pull latest from origin/main
#   b) bump VERSION by 1
#   c) run health-check.sh
#   d) healthy  -> commit the bump, push, restart services, notify on Telegram
#   e) unhealthy-> hard-reset to the pre-deploy commit, notify on Telegram
#
# We do NOT use `set -e`; every fallible step is checked by hand so a failure
# always lands in the rollback path instead of leaving iris half-updated.

set -uo pipefail

IRIS_DIR="$HOME/work/iris"
cd "$IRIS_DIR" || { echo "[deploy] FAIL: cannot cd to $IRIS_DIR"; exit 1; }

VERSION_FILE="$IRIS_DIR/VERSION"
HEALTH="$IRIS_DIR/scripts/health-check.sh"
TELEGRAM="$IRIS_DIR/skills/telegram.sh"

log() { echo "[deploy] $*"; }

# Best-effort Telegram notification — never abort the deploy if it fails.
notify() {
  [ -f "$TELEGRAM" ] || { log "telegram skill missing, skipping notify"; return 0; }
  bash "$TELEGRAM" "$1" >/dev/null 2>&1 \
    && log "telegram: sent \"$1\"" \
    || log "telegram notify failed (continuing)"
}

# Restart whichever iris systemd --user units are actually installed.
restart_services() {
  local restarted=0 unit
  for unit in iris-telegram-bridge.service iris-panel.service iris-talk.service; do
    if systemctl --user list-unit-files "$unit" --no-pager 2>/dev/null | grep -q "$unit"; then
      log "restarting $unit"
      systemctl --user restart "$unit" 2>/dev/null && restarted=1
    fi
  done
  [ "$restarted" -eq 1 ] || log "no iris systemd --user services installed to restart"
}

# --- capture pre-deploy state for rollback -------------------------------------
PREV_COMMIT="$(git rev-parse HEAD)"
OLD_VERSION="$(cat "$VERSION_FILE" 2>/dev/null || echo 0)"
log "starting from v${OLD_VERSION} (${PREV_COMMIT:0:8})"

# --- a) pull -------------------------------------------------------------------
log "pulling latest from origin/main…"
if ! git pull --ff-only origin main; then
  log "git pull failed — no changes made"
  notify "iris update failed: git pull error (still on v${OLD_VERSION})"
  exit 1
fi

# --- b) bump VERSION -----------------------------------------------------------
NEW_VERSION=$(( $(cat "$VERSION_FILE" 2>/dev/null || echo 0) + 1 ))
echo "$NEW_VERSION" > "$VERSION_FILE"
log "bumped VERSION ${OLD_VERSION} -> ${NEW_VERSION}"

# --- c) health check -----------------------------------------------------------
log "running health check…"
if bash "$HEALTH"; then
  # --- d) success --------------------------------------------------------------
  log "health check passed"
  git add "$VERSION_FILE"
  git commit -m "chore: deploy iris v${NEW_VERSION}" >/dev/null
  if git push origin main; then
    log "pushed v${NEW_VERSION} to origin/main"
  else
    log "push failed — commit is local only; remote will sync on next deploy"
  fi
  restart_services
  notify "iris updated to v${NEW_VERSION}"
  log "deploy complete: now on v${NEW_VERSION}"
  exit 0
else
  # --- e) rollback -------------------------------------------------------------
  log "health check FAILED — rolling back to ${PREV_COMMIT:0:8}"
  git reset --hard "$PREV_COMMIT" >/dev/null 2>&1
  git clean -fd >/dev/null 2>&1   # drop any stray files the bad pull introduced
  notify "iris update failed, rolled back to v${OLD_VERSION}"
  log "rolled back to v${OLD_VERSION} (${PREV_COMMIT:0:8})"
  exit 1
fi
