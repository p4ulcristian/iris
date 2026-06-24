#!/usr/bin/env bash
# start.sh — launch the iris YouTube player server and a Chromium app window.
#
# Idempotent: if the server is already up it is reused; if the app window is
# already open nothing new is launched. Safe to call repeatedly.

set -euo pipefail

PORT="${IRIS_YT_PORT:-8745}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
URL="http://localhost:${PORT}"
PROFILE_DIR="${HOME}/.config/iris-youtube-chrome"

log() { echo "youtube-player: $*" >&2; }

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
for b in chromium chromium-browser google-chrome google-chrome-stable; do
	if command -v "$b" >/dev/null 2>&1; then
		BROWSER="$(command -v "$b")"
		break
	fi
done

server_up() { curl -s --max-time 2 "${URL}/health" >/dev/null 2>&1; }

# --- start the server -------------------------------------------------------
if server_up; then
	log "server already running on ${URL}"
else
	log "starting server on ${URL}"
	IRIS_YT_PORT="$PORT" nohup python3 "${HERE}/server.py" >/tmp/iris-youtube-server.log 2>&1 &
	# wait for it to come up (up to ~5s)
	for _ in $(seq 1 25); do
		server_up && break
		sleep 0.2
	done
	server_up || { log "server failed to start (see /tmp/iris-youtube-server.log)"; exit 1; }
fi

# --- launch the app window --------------------------------------------------
if [ -z "$BROWSER" ]; then
	log "no Chromium/Chrome binary found — server is up at ${URL}, open it manually"
	exit 0
fi

# Already have an app window pointed at our URL? leave it be.
# Match the browser binary immediately followed by --app= so we don't get a
# false positive from other processes (e.g. iris's worker) that merely mention
# the URL string in their command line.
if pgrep -f -- "${BROWSER##*/} --app=${URL}" >/dev/null 2>&1; then
	log "app window already open"
	exit 0
fi

log "launching ${BROWSER##*/} app window at ${URL}"
nohup "$BROWSER" \
	--app="${URL}" \
	--ozone-platform=wayland \
	--window-size=800,600 \
	--user-data-dir="${PROFILE_DIR}" \
	--no-first-run \
	--no-default-browser-check \
	--autoplay-policy=no-user-gesture-required \
	>/tmp/iris-youtube-chrome.log 2>&1 &

log "ready"
