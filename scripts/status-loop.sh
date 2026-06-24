#!/usr/bin/env bash
# status-loop.sh — post a brief iris status to BOTH Telegram and the iris panel
# chat, once now and then every $INTERVAL seconds.
#
# Status line = current iris version + last git commit + active worker state.
#
# Telegram creds come from config/telegram.env (TELEGRAM_BOT_TOKEN +
# TELEGRAM_CHAT_ID). The panel message is delivered the same way Paul's typed
# panel messages are — POST /chat — but reached over SSH to Gaia.
#
# Launch (detached), recording the PID for later teardown:
#   nohup bash ~/work/iris/scripts/status-loop.sh >/tmp/iris-status-loop.log 2>&1 &
#   echo $! > /tmp/iris-status-loop.pid
#
# Stop:
#   kill "$(cat /tmp/iris-status-loop.pid)"

set -uo pipefail

IRIS_DIR="$HOME/work/iris"
ENV_FILE="$IRIS_DIR/config/telegram.env"
PANEL_SSH="${IRIS_PANEL_SSH:-paul@10.99.0.3}"
PANEL_URL="${IRIS_PANEL_CHAT_URL:-http://localhost:4270/chat}"
INTERVAL="${IRIS_STATUS_INTERVAL:-60}"

# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

# Build the brief status string.
build_status() {
  local ver commit workers wjson reg
  ver="$(cat "$IRIS_DIR/VERSION" 2>/dev/null || echo '?')"
  commit="$(git -C "$IRIS_DIR" log -1 --pretty='%h %s' 2>/dev/null || echo '?')"

  # Count active (running) workers from the registry; fall back to the legacy
  # single-worker file for older deploys.
  workers="unknown"
  reg="$IRIS_DIR/brain/workers.json"
  [ -f "$reg" ] || reg="$HOME/.cache/iris-talk/workers.json"
  wjson="$HOME/.cache/iris-talk/worker.json"
  if command -v jq >/dev/null 2>&1 && [ -f "$reg" ]; then
    local n task
    n="$(jq -r '[.[] | select(.status=="running")] | length' "$reg" 2>/dev/null || echo 0)"
    task="$(jq -r 'first(.[] | select(.status=="running") | .task) // ""' "$reg" 2>/dev/null || echo '')"
    if [ "${n:-0}" -gt 0 ]; then
      workers="${n} active — ${task:0:60}"
    else
      workers="none"
    fi
  elif [ -f "$wjson" ] && command -v jq >/dev/null 2>&1; then
    local st
    st="$(jq -r '.status // "idle"' "$wjson" 2>/dev/null || echo idle)"
    [ "$st" = "running" ] && workers="1 active" || workers="none (${st})"
  fi

  # Strip single quotes so the message survives SSH single-quote wrapping.
  printf 'STATUS: iris v%s | %s | workers: %s' "$ver" "$commit" "$workers" \
    | tr -d "'"
}

send_telegram() {
  local msg="$1"
  [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ] || {
    echo "[status-loop] telegram creds missing, skipping" >&2; return 0; }
  curl -sS --max-time 20 \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${msg}" >/dev/null 2>&1 \
    && echo "[status-loop] telegram sent" \
    || echo "[status-loop] telegram send failed" >&2
}

send_panel() {
  local msg="$1" payload
  if command -v jq >/dev/null 2>&1; then
    payload="$(jq -nc --arg t "$msg" '{text:$t}')"
  else
    payload="{\"text\":\"${msg}\"}"
  fi
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$PANEL_SSH" \
    "curl -s -X POST '${PANEL_URL}' -H 'Content-Type: application/json' -d '${payload}'" \
    >/dev/null 2>&1 \
    && echo "[status-loop] panel sent" \
    || echo "[status-loop] panel send failed" >&2
}

tick() {
  local msg; msg="$(build_status)"
  echo "[status-loop] $(date '+%H:%M:%S') $msg"
  send_telegram "$msg"
  send_panel "$msg"
}

tick                      # first message immediately
while true; do
  sleep "$INTERVAL"
  tick
done
