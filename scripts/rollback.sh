#!/usr/bin/env bash
# rollback.sh — manually revert iris to the previous git commit.
#
# A hard reset to HEAD~1 restores both the code and the VERSION file (VERSION is
# committed, so the old value comes back automatically).
#
#   bash scripts/rollback.sh           # local revert only
#   bash scripts/rollback.sh --push    # also force-push the revert to origin
#
# Use --push with care: it rewrites origin/main with --force-with-lease.

set -uo pipefail

IRIS_DIR="$HOME/work/iris"
cd "$IRIS_DIR" || { echo "[rollback] FAIL: cannot cd to $IRIS_DIR"; exit 1; }

TELEGRAM="$IRIS_DIR/skills/telegram.sh"
PUSH=0
[ "${1:-}" = "--push" ] && PUSH=1

notify() {
  [ -f "$TELEGRAM" ] || return 0
  bash "$TELEGRAM" "$1" >/dev/null 2>&1 || true
}

if ! git rev-parse "HEAD~1" >/dev/null 2>&1; then
  echo "[rollback] FAIL: no previous commit to roll back to"
  exit 1
fi

CUR_COMMIT="$(git rev-parse HEAD)"
CUR_VERSION="$(cat VERSION 2>/dev/null || echo '?')"
PREV_COMMIT="$(git rev-parse HEAD~1)"

echo "[rollback] current: v${CUR_VERSION} (${CUR_COMMIT:0:8})"
echo "[rollback] reverting to ${PREV_COMMIT:0:8}…"
git reset --hard "$PREV_COMMIT"

NEW_VERSION="$(cat VERSION 2>/dev/null || echo '?')"
echo "[rollback] now on v${NEW_VERSION} (${PREV_COMMIT:0:8})"

if [ "$PUSH" -eq 1 ]; then
  echo "[rollback] force-pushing revert to origin/main…"
  if git push --force-with-lease origin main; then
    echo "[rollback] pushed"
  else
    echo "[rollback] push failed — local revert stands, origin unchanged"
  fi
else
  echo "[rollback] local only — origin still has v${CUR_VERSION}; use --push to revert it too"
fi

notify "iris rolled back from v${CUR_VERSION} to v${NEW_VERSION}"
