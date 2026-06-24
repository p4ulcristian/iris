#!/usr/bin/env python3
"""
telegram-bridge.py — a bidirectional bridge between Paul's Telegram
(@irishelpsme_bot) and iris.

Two directions, two threads, stdlib only:

  INBOUND   Telegram -> iris
            Long-polls getUpdates (30s long poll). Each incoming text message
            from Paul is POSTed to the iris panel's `POST /chat` endpoint —
            exactly what the panel text box does — so iris's brain processes it.

  OUTBOUND  iris -> Telegram
            Subscribes to the panel's `GET /stream` Server-Sent Events feed and
            forwards every iris *reply* to Telegram. Because *every* turn
            (voice OR text) funnels through `panel_post({"type":"reply",...})`
            in iris-talk, this single hook relays voice replies, panel-typed
            replies, and the answers to Telegram-originated messages alike.

The reply to a Telegram message therefore arrives "for free": the message goes
in via /chat, iris answers, the answer is published as a reply event, and the
outbound thread ships it back to Telegram. No synchronous request/response
correlation needed.

Config (config/telegram.env, mode 600):
    TELEGRAM_BOT_TOKEN   the bot token
    TELEGRAM_CHAT_ID     Paul's chat id (also cached in config/telegram-chat-id)

Run:
    python3 ~/work/iris/skills/telegram-bridge.py
    nohup python3 ~/work/iris/skills/telegram-bridge.py >/tmp/iris-tg.log 2>&1 &
or install iris-telegram-bridge.service as a systemd --user unit.
"""
import json
import os
import sys
import threading
import time
import urllib.parse
import urllib.request

IRIS_DIR = os.path.expanduser("~/work/iris")
ENV_FILE = os.path.join(IRIS_DIR, "config", "telegram.env")
CHAT_ID_FILE = os.path.join(IRIS_DIR, "config", "telegram-chat-id")
OFFSET_FILE = os.path.expanduser("~/.cache/iris-talk/telegram-offset")
PANEL_URL = os.environ.get("IRIS_PANEL_URL", "http://127.0.0.1:4270").rstrip("/")

# How long after (re)connecting to /stream we treat events as historical backlog
# (the panel replays the current turn on connect) and skip them, so we don't
# re-send old replies to Telegram on every startup/reconnect.
BACKLOG_GRACE_S = 2.0


def load_env(path):
    env = {}
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    except OSError:
        pass
    return env


ENV = load_env(ENV_FILE)
TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN") or ENV.get("TELEGRAM_BOT_TOKEN", "")
if not TOKEN:
    sys.exit("telegram-bridge: TELEGRAM_BOT_TOKEN not set (config/telegram.env)")
API = f"https://api.telegram.org/bot{TOKEN}"


def known_chat_id():
    """Paul's chat id, from the cache file, the env, or None (learn at runtime)."""
    try:
        with open(CHAT_ID_FILE) as f:
            cid = f.read().strip()
            if cid:
                return cid
    except OSError:
        pass
    return os.environ.get("TELEGRAM_CHAT_ID") or ENV.get("TELEGRAM_CHAT_ID") or None


def remember_chat_id(cid):
    try:
        with open(CHAT_ID_FILE) as f:
            if f.read().strip():
                return                     # first writer wins; Paul is sole user
    except OSError:
        pass
    os.makedirs(os.path.dirname(CHAT_ID_FILE), exist_ok=True)
    with open(CHAT_ID_FILE, "w") as f:
        f.write(str(cid) + "\n")
    log(f"learned chat id {cid}")


def log(msg):
    print(f"[telegram-bridge] {msg}", flush=True)


# --- Telegram helpers -------------------------------------------------------

def tg_send(chat_id, text):
    if not text:
        return
    # Telegram caps messages at 4096 chars; chunk longer replies.
    for i in range(0, len(text), 4000):
        chunk = text[i:i + 4000]
        data = urllib.parse.urlencode({"chat_id": chat_id, "text": chunk}).encode()
        try:
            req = urllib.request.Request(API + "/sendMessage", data=data, method="POST")
            urllib.request.urlopen(req, timeout=20).read()
        except Exception as e:             # noqa: BLE001
            log(f"send failed: {e}")
            return


def panel_chat(text):
    """Inject a message into iris exactly like the panel text box does."""
    data = json.dumps({"text": text}).encode()
    req = urllib.request.Request(
        PANEL_URL + "/chat", data=data,
        headers={"Content-Type": "application/json"}, method="POST")
    urllib.request.urlopen(req, timeout=10).read()


# --- INBOUND: Telegram -> iris ----------------------------------------------

def read_offset():
    try:
        with open(OFFSET_FILE) as f:
            return int(f.read().strip() or 0)
    except (OSError, ValueError):
        return 0


def write_offset(off):
    os.makedirs(os.path.dirname(OFFSET_FILE), exist_ok=True)
    with open(OFFSET_FILE, "w") as f:
        f.write(str(off))


def inbound_loop():
    offset = read_offset()
    log(f"inbound: polling getUpdates (offset={offset}) -> {PANEL_URL}/chat")
    while True:
        try:
            q = urllib.parse.urlencode({"offset": offset, "timeout": 30})
            req = urllib.request.Request(API + "/getUpdates?" + q)
            resp = json.loads(urllib.request.urlopen(req, timeout=45).read())
        except Exception as e:             # noqa: BLE001
            log(f"inbound: getUpdates error: {e}")
            time.sleep(5)
            continue
        if not resp.get("ok"):
            time.sleep(5)
            continue
        for upd in resp.get("result", []):
            offset = upd["update_id"] + 1
            write_offset(offset)
            msg = upd.get("message") or upd.get("edited_message") or {}
            chat = msg.get("chat", {})
            cid = chat.get("id")
            text = (msg.get("text") or "").strip()
            if cid is None:
                continue
            remember_chat_id(cid)
            if not text:
                continue
            if text == "/start":
                tg_send(cid, "iris is connected. Send a message and I'll act on "
                             "it on Gaia — and you'll hear back here whenever iris "
                             "replies, by voice or text.")
                log(f"/start from {cid}")
                continue
            log(f"inbound: forwarding: {text!r}")
            try:
                panel_chat(text)
            except Exception as e:         # noqa: BLE001
                log(f"inbound: could not reach panel: {e}")
                tg_send(cid, f"⚠ couldn't reach iris panel: {e}")


# --- OUTBOUND: iris -> Telegram ---------------------------------------------

def outbound_loop():
    log(f"outbound: subscribing to {PANEL_URL}/stream")
    while True:
        try:
            req = urllib.request.Request(PANEL_URL + "/stream",
                                         headers={"Accept": "text/event-stream"})
            resp = urllib.request.urlopen(req, timeout=60)
        except Exception as e:             # noqa: BLE001
            log(f"outbound: can't connect to panel stream: {e}")
            time.sleep(5)
            continue

        connected_at = time.monotonic()
        log("outbound: stream connected")
        try:
            for raw in resp:
                line = raw.decode("utf-8", "replace").rstrip("\n")
                if not line.startswith("data: "):
                    continue              # ": ping" keep-alives, blank lines
                try:
                    ev = json.loads(line[6:])
                except ValueError:
                    continue
                # Skip the replayed backlog delivered right after connect.
                if time.monotonic() - connected_at < BACKLOG_GRACE_S:
                    continue
                if ev.get("type") != "reply":
                    continue
                if ev.get("lane") == "worker":
                    continue              # iris's own replies only, not worker chatter
                text = (ev.get("text") or "").strip()
                if not text:
                    continue
                cid = known_chat_id()
                if not cid:
                    log("outbound: have a reply but no chat id yet (send /start)")
                    continue
                log(f"outbound: relaying reply ({len(text)} chars)")
                tg_send(cid, text)
        except Exception as e:             # noqa: BLE001
            log(f"outbound: stream dropped: {e}")
        finally:
            try:
                resp.close()
            except Exception:             # noqa: BLE001
                pass
        time.sleep(2)                     # reconnect


def main():
    cid = known_chat_id()
    log(f"starting; panel={PANEL_URL} chat_id={cid or '(unknown — send /start)'}")
    t_out = threading.Thread(target=outbound_loop, daemon=True)
    t_out.start()
    inbound_loop()                        # runs in the main thread forever


if __name__ == "__main__":
    main()
