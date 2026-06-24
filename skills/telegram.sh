#!/usr/bin/env bash
# telegram.sh — send a Telegram message to Paul via the iris bot (@irishelpsme_bot).
#
# Usage:
#   bash ~/work/iris/skills/telegram.sh "your message here"
#   echo "piped message" | bash ~/work/iris/skills/telegram.sh
#
# Reads TELEGRAM_BOT_TOKEN from ~/work/iris/config/telegram.env and Paul's chat
# ID from ~/work/iris/config/telegram-chat-id (written by telegram-listener.sh
# the first time Paul messages the bot — he must send /start once).
set -euo pipefail

IRIS_DIR="$HOME/work/iris"
ENV_FILE="$IRIS_DIR/config/telegram.env"
CHAT_ID_FILE="$IRIS_DIR/config/telegram-chat-id"

[ -f "$ENV_FILE" ] || { echo "telegram.sh: missing $ENV_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
. "$ENV_FILE"
[ -n "${TELEGRAM_BOT_TOKEN:-}" ] || { echo "telegram.sh: TELEGRAM_BOT_TOKEN unset" >&2; exit 1; }

if [ ! -f "$CHAT_ID_FILE" ]; then
  echo "telegram.sh: no chat ID yet ($CHAT_ID_FILE)." >&2
  echo "  Paul must send /start to @irishelpsme_bot, with the listener running." >&2
  exit 1
fi
CHAT_ID="$(cat "$CHAT_ID_FILE")"

# Message from args, or stdin if no args.
if [ "$#" -gt 0 ]; then
  MSG="$*"
else
  MSG="$(cat)"
fi
[ -n "$MSG" ] || { echo "telegram.sh: empty message" >&2; exit 1; }

curl -sS --max-time 20 \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${CHAT_ID}" \
  --data-urlencode "text=${MSG}" \
  | jq -e '.ok == true' >/dev/null \
  && echo "sent" \
  || { echo "telegram.sh: send failed" >&2; exit 1; }
