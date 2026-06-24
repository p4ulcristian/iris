#!/usr/bin/env bash
# telegram-listener.sh — long-poll the iris Telegram bot (@irishelpsme_bot) and
# forward every incoming text message to the iris panel's /chat endpoint, so Paul
# can drive iris from Telegram exactly like the panel text box.
#
# Side effects:
#   * Records the chat ID of the first/sender into config/telegram-chat-id, so
#     skills/telegram.sh can message Paul back. (Paul must send /start once.)
#   * Replies to /start with a confirmation.
#
# Usage:
#   bash ~/work/iris/skills/telegram-listener.sh          # run in foreground
#   nohup bash ~/work/iris/skills/telegram-listener.sh &  # background
#
# stdlib/curl only — no python-telegram-bot needed.
set -euo pipefail

IRIS_DIR="$HOME/work/iris"
ENV_FILE="$IRIS_DIR/config/telegram.env"
CHAT_ID_FILE="$IRIS_DIR/config/telegram-chat-id"
OFFSET_FILE="$HOME/.cache/iris-talk/telegram-offset"
PANEL_CHAT_URL="${IRIS_PANEL_URL:-http://localhost:4270}/chat"

[ -f "$ENV_FILE" ] || { echo "listener: missing $ENV_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
. "$ENV_FILE"
[ -n "${TELEGRAM_BOT_TOKEN:-}" ] || { echo "listener: TELEGRAM_BOT_TOKEN unset" >&2; exit 1; }

API="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"
mkdir -p "$(dirname "$OFFSET_FILE")"
OFFSET="$(cat "$OFFSET_FILE" 2>/dev/null || echo 0)"

tg_send() {  # chat_id, text
  curl -sS --max-time 20 "$API/sendMessage" \
    --data-urlencode "chat_id=$1" --data-urlencode "text=$2" >/dev/null || true
}

echo "listener: polling $API (offset=$OFFSET) -> $PANEL_CHAT_URL"
while true; do
  # Long poll (30s). timeout param keeps the HTTP request open until a message
  # arrives, so we are not hammering the API.
  RESP="$(curl -sS --max-time 40 "$API/getUpdates" \
            --data-urlencode "offset=$OFFSET" \
            --data-urlencode "timeout=30" 2>/dev/null || echo '')"
  [ -n "$RESP" ] || { sleep 2; continue; }
  echo "$RESP" | jq -e '.ok == true' >/dev/null 2>&1 || { sleep 5; continue; }

  # Walk each update: advance offset, capture chat id, forward text.
  while IFS=$'\t' read -r upd_id chat_id chat_name text; do
    [ -n "$upd_id" ] || continue
    OFFSET=$((upd_id + 1))
    echo "$OFFSET" > "$OFFSET_FILE"

    [ -n "$chat_id" ] || continue
    # Remember the sender so iris can reply (first writer wins; Paul is sole user).
    if [ ! -f "$CHAT_ID_FILE" ]; then
      echo "$chat_id" > "$CHAT_ID_FILE"
      echo "listener: learned chat ID $chat_id ($chat_name)"
    fi

    [ -n "$text" ] || continue
    if [ "$text" = "/start" ]; then
      tg_send "$chat_id" "iris is connected. Send me a message and I'll act on it on Gaia."
      echo "listener: /start from $chat_id ($chat_name)"
      continue
    fi

    echo "listener: forwarding from $chat_name: $text"
    curl -sS --max-time 10 "$PANEL_CHAT_URL" \
      -H 'Content-Type: application/json' \
      --data "$(jq -nc --arg t "$text" '{text:$t}')" >/dev/null 2>&1 \
      || echo "listener: WARN could not reach panel at $PANEL_CHAT_URL" >&2
  done < <(echo "$RESP" | jq -r '
      .result[]
      | [ (.update_id|tostring),
          (.message.chat.id // empty | tostring),
          (.message.from.first_name // .message.chat.title // "unknown"),
          (.message.text // "")
        ] | @tsv')
done
