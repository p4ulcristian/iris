#!/usr/bin/env bash
# play-youtube.sh — open Chrome (with remote debugging) and autoplay a YouTube video.
#
# Usage: play-youtube.sh [youtube-url | video-id | search terms]
#
# Behaviour:
#   1. Ensures a Chrome/Chromium is running with --remote-debugging-port=9222
#      (launches one with autoplay enabled if the debug endpoint is not up).
#   2. Opens a tab on the requested YouTube URL via the DevTools HTTP API.
#   3. Forces playback (unmute + play) over the DevTools websocket, so the
#      video starts even when Chrome was already running without autoplay flags.
#
# Argument forms:
#   (none)                          -> a default music video
#   https://www.youtube.com/...     -> used verbatim (autoplay=1 added to watch URLs)
#   dQw4w9WgXcQ                     -> treated as a video id
#   anything else                   -> treated as a search query (opens results)
#
# Requires: chromium or google-chrome, curl, jq, python3.

set -euo pipefail

PORT=9222
DEBUG_HOST="127.0.0.1"
DEFAULT_URL="https://www.youtube.com/watch?v=jfKfPfyJRdk"  # lofi hip hop radio
PROFILE_DIR="${HOME}/.config/iris-chrome-debug"

log() { echo "play-youtube: $*" >&2; }

# --- ensure a Wayland display ----------------------------------------------
# iris's worker can run from a bare tty; discover the desktop's Wayland socket
# (and Hyprland instance) so the browser opens on Paul's screen.
ensure_wayland() {
	: "${XDG_RUNTIME_DIR:=/run/user/$(id -u)}"
	export XDG_RUNTIME_DIR
	if [ -z "${WAYLAND_DISPLAY:-}" ]; then
		local sock
		sock="$(find "$XDG_RUNTIME_DIR" -maxdepth 1 -name 'wayland-*' ! -name '*.lock' ! -name '*.sock' 2>/dev/null | sort | head -1)"
		[ -n "$sock" ] && export WAYLAND_DISPLAY="$(basename "$sock")"
	fi
	if [ -z "${HYPRLAND_INSTANCE_SIGNATURE:-}" ] && [ -d "$XDG_RUNTIME_DIR/hypr" ]; then
		local inst
		inst="$(ls -1t "$XDG_RUNTIME_DIR/hypr" 2>/dev/null | head -1)"
		[ -n "$inst" ] && export HYPRLAND_INSTANCE_SIGNATURE="$inst"
	fi
}
ensure_wayland

# --- find a browser binary --------------------------------------------------
BROWSER=""
for b in google-chrome google-chrome-stable chromium chromium-browser; do
	if command -v "$b" >/dev/null 2>&1; then
		BROWSER="$(command -v "$b")"
		break
	fi
done
if [ -z "$BROWSER" ]; then
	log "no Chrome/Chromium binary found"; exit 1
fi

for dep in curl jq python3; do
	command -v "$dep" >/dev/null 2>&1 || { log "missing dependency: $dep"; exit 1; }
done

# --- normalise the requested URL -------------------------------------------
arg="${1:-}"
if [ -z "$arg" ]; then
	URL="$DEFAULT_URL"
elif [[ "$arg" =~ ^https?:// ]]; then
	URL="$arg"
elif [[ "$arg" =~ ^[A-Za-z0-9_-]{11}$ ]]; then
	URL="https://www.youtube.com/watch?v=${arg}"
else
	# free text -> search results page
	q="$(jq -rn --arg s "$arg" '$s|@uri')"
	URL="https://www.youtube.com/results?search_query=${q}"
fi

# add autoplay=1 to watch URLs that don't already carry it
if [[ "$URL" == *"/watch?"* && "$URL" != *"autoplay="* ]]; then
	URL="${URL}&autoplay=1"
fi

# --- ensure the debug endpoint is up ---------------------------------------
debug_up() { curl -s --max-time 2 "http://${DEBUG_HOST}:${PORT}/json/version" >/dev/null 2>&1; }

if debug_up; then
	log "reusing running browser on port ${PORT}"
else
	log "launching ${BROWSER##*/} with remote debugging on ${PORT}"
	mkdir -p "$PROFILE_DIR"
	"$BROWSER" \
		--remote-debugging-port="$PORT" \
		--remote-allow-origins=* \
		--user-data-dir="$PROFILE_DIR" \
		--autoplay-policy=no-user-gesture-required \
		--ozone-platform-hint=auto \
		--no-first-run --no-default-browser-check \
		>/dev/null 2>&1 &
	# wait for the endpoint (up to ~15s)
	for _ in $(seq 1 30); do
		debug_up && break
		sleep 0.5
	done
	debug_up || { log "browser did not expose the debug port"; exit 1; }
fi

# --- open the tab via the DevTools HTTP API --------------------------------
# Newer Chrome wants PUT for /json/new; older accepts GET. Try PUT then GET.
log "opening $URL"
new_json="$(curl -s -X PUT "http://${DEBUG_HOST}:${PORT}/json/new?${URL}")"
if ! echo "$new_json" | jq -e '.webSocketDebuggerUrl' >/dev/null 2>&1; then
	new_json="$(curl -s "http://${DEBUG_HOST}:${PORT}/json/new?${URL}")"
fi

ws_url="$(echo "$new_json" | jq -r '.webSocketDebuggerUrl // empty')"
if [ -z "$ws_url" ]; then
	log "could not create a new tab; the URL is open but autoplay was not forced"
	exit 0
fi

# --- force playback over the DevTools websocket ----------------------------
# Pure-stdlib websocket client; retries until the <video> element appears.
log "forcing playback"
python3 - "$ws_url" <<'PY'
import sys, socket, os, base64, struct, json
from urllib.parse import urlparse

ws_url = sys.argv[1]
u = urlparse(ws_url)
host = u.hostname
port = u.port or 80
path = u.path or "/"

s = socket.create_connection((host, port), timeout=10)
key = base64.b64encode(os.urandom(16)).decode()
handshake = (
    f"GET {path} HTTP/1.1\r\n"
    f"Host: {host}:{port}\r\n"
    "Upgrade: websocket\r\n"
    "Connection: Upgrade\r\n"
    f"Sec-WebSocket-Key: {key}\r\n"
    "Sec-WebSocket-Version: 13\r\n"
    "\r\n"
)
s.sendall(handshake.encode())

# read until end of HTTP headers
buf = b""
while b"\r\n\r\n" not in buf:
    chunk = s.recv(4096)
    if not chunk:
        raise SystemExit("ws handshake failed")
    buf += chunk

def send_text(payload):
    data = payload.encode()
    header = bytearray([0x81])  # FIN + text
    mask = os.urandom(4)
    n = len(data)
    if n < 126:
        header.append(0x80 | n)
    elif n < 65536:
        header.append(0x80 | 126); header += struct.pack(">H", n)
    else:
        header.append(0x80 | 127); header += struct.pack(">Q", n)
    header += mask
    masked = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
    s.sendall(bytes(header) + masked)

def recv_frame():
    def rd(n):
        out = b""
        while len(out) < n:
            c = s.recv(n - len(out))
            if not c:
                raise SystemExit("ws closed")
            out += c
        return out
    b0, b1 = rd(2)
    ln = b1 & 0x7F
    if ln == 126:
        ln = struct.unpack(">H", rd(2))[0]
    elif ln == 127:
        ln = struct.unpack(">Q", rd(8))[0]
    return rd(ln)

# JS: unmute + play the video, retrying a few times while the page loads.
js = (
    "(function(){let n=0;const t=setInterval(()=>{"
    "const v=document.querySelector('video');"
    "if(v){v.muted=false;v.play().catch(()=>{v.muted=true;v.play().catch(()=>{});});}"
    "if(++n>20)clearInterval(t);},500);return 'ok';})()"
)
msg = {"id": 1, "method": "Runtime.evaluate",
       "params": {"expression": js, "awaitPromise": False}}
send_text(json.dumps(msg))

# read until we see our response (id==1) or give up
s.settimeout(8)
try:
    for _ in range(10):
        frame = recv_frame()
        try:
            data = json.loads(frame.decode("utf-8", "replace"))
        except ValueError:
            continue
        if data.get("id") == 1:
            break
except Exception as e:
    print(f"playback nudge sent (no ack: {e})", file=sys.stderr)
finally:
    s.close()
print("playback triggered", file=sys.stderr)
PY

log "done"
