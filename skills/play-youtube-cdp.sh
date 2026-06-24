#!/usr/bin/env bash
# play-youtube-cdp.sh — play a YouTube video by reusing an already-running
# Chromium/Chrome via the DevTools Protocol (port 9222). No Python.
#
# Usage:
#   play-youtube-cdp.sh <youtube-url | video-id | search terms>
#
# Behaviour:
#   1. Talks to the DevTools HTTP API at http://localhost:9222/json.
#   2. If a YouTube tab is already open, NAVIGATES that tab to the requested
#      video (Page.navigate over the DevTools websocket) and brings it to front.
#   3. If no YouTube tab exists, opens a new one (PUT /json/new?URL).
#   4. Forces playback (unmute + play) over the websocket so it starts even
#      when Chromium was launched without autoplay flags.
#
# REQUIREMENT: Chromium/Chrome must ALREADY be running with remote debugging:
#       chromium --remote-debugging-port=9222 --remote-allow-origins=*
#   This script does NOT launch the browser; it only drives the running one.
#   (Use play-youtube.sh if you also need it launched.)
#
# Argument forms:
#   https://www.youtube.com/...   -> used verbatim (autoplay=1 added to /watch)
#   dQw4w9WgXcQ                   -> treated as an 11-char video id
#   anything else                 -> treated as a search query (results page)
#
# Requires: bash (for /dev/tcp), curl, jq.

set -euo pipefail

PORT=9222
HOST="127.0.0.1"

log() { echo "play-youtube-cdp: $*" >&2; }

for dep in curl jq; do
	command -v "$dep" >/dev/null 2>&1 || { log "missing dependency: $dep"; exit 1; }
done

# --- normalise the requested URL -------------------------------------------
arg="${*:-}"
if [ -z "$arg" ]; then
	log "usage: play-youtube-cdp.sh <youtube-url | video-id | search terms>"
	exit 2
elif [[ "$arg" =~ ^https?:// ]]; then
	URL="$arg"
elif [[ "$arg" =~ ^[A-Za-z0-9_-]{11}$ ]]; then
	URL="https://www.youtube.com/watch?v=${arg}"
else
	q="$(jq -rn --arg s "$arg" '$s|@uri')"
	URL="https://www.youtube.com/results?search_query=${q}"
fi
# add autoplay=1 to /watch URLs that don't already carry it
if [[ "$URL" == *"/watch?"* && "$URL" != *"autoplay="* ]]; then
	URL="${URL}&autoplay=1"
fi

# --- require a running debug endpoint --------------------------------------
if ! curl -s --max-time 3 "http://${HOST}:${PORT}/json/version" >/dev/null 2>&1; then
	log "DevTools endpoint not reachable on ${HOST}:${PORT}."
	log "Start Chromium first, e.g.:"
	log "  chromium --remote-debugging-port=${PORT} --remote-allow-origins=*"
	exit 1
fi

# --- minimal pure-bash DevTools websocket client ---------------------------
# Sends one or more JSON command frames to a target's webSocketDebuggerUrl.
# Uses an all-zero mask key (valid per RFC6455) so the payload stays plain
# ASCII and bash can write it byte-for-byte. $@ = JSON payload strings.
ws_send() {
	local ws_url="$1"; shift
	local hostport="${ws_url#ws://}"; local path="/${hostport#*/}"
	hostport="${hostport%%/*}"
	local h="${hostport%%:*}" p="${hostport##*:}"

	exec 3<>"/dev/tcp/${h}/${p}" || { log "ws connect failed"; return 1; }

	# handshake (the Sec-WebSocket-Key value is arbitrary; we don't verify Accept)
	printf 'GET %s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: aXJpcy1jZHAtd3MtMDE=\r\nSec-WebSocket-Version: 13\r\n\r\n' \
		"$path" "$hostport" >&3
	# drain response headers up to the blank line
	local line
	while IFS= read -r -t 5 line <&3; do
		[ "${line%$'\r'}" = "" ] && break
	done

	local payload len b2hex hi lo
	for payload in "$@"; do
		len=${#payload}
		if [ "$len" -lt 126 ]; then
			b2hex="$(printf '%02x' $((128 + len)))"
			printf "\\x81\\x${b2hex}\\x00\\x00\\x00\\x00%s" "$payload" >&3
		else
			hi="$(printf '%02x' $((len / 256)))"
			lo="$(printf '%02x' $((len % 256)))"
			printf "\\x81\\xfe\\x${hi}\\x${lo}\\x00\\x00\\x00\\x00%s" "$payload" >&3
		fi
		sleep 0.2
	done

	# give Chromium a moment to process, then drain & close
	timeout 3 cat <&3 >/dev/null 2>&1 || true
	exec 3>&- 3<&- || true
}

# --- find an existing YouTube tab ------------------------------------------
tabs_json="$(curl -s "http://${HOST}:${PORT}/json")"
yt="$(echo "$tabs_json" | jq -r '
	[ .[] | select(.type=="page")
	      | select(.url|test("youtube\\.com|youtu\\.be")) ][0]
	// empty | "\(.id)\t\(.webSocketDebuggerUrl)"')"

# autoplay nudge: unmute + play the <video>, retrying while the page loads
PLAY_JS="(function(){let n=0;const t=setInterval(()=>{const v=document.querySelector('video');if(v){v.muted=false;v.play().catch(()=>{v.muted=true;v.play().catch(()=>{});});}if(++n>20)clearInterval(t);},500);return 'ok';})()"
play_msg="$(jq -cn --arg js "$PLAY_JS" '{id:2,method:"Runtime.evaluate",params:{expression:$js,awaitPromise:false}}')"

if [ -n "$yt" ]; then
	tab_id="${yt%%	*}"
	ws_url="${yt#*	}"
	log "navigating existing YouTube tab -> $URL"
	curl -s "http://${HOST}:${PORT}/json/activate/${tab_id}" >/dev/null 2>&1 || true
	nav_msg="$(jq -cn --arg url "$URL" '{id:1,method:"Page.navigate",params:{url:$url}}')"
	ws_send "$ws_url" "$nav_msg"
	sleep 3
	ws_send "$ws_url" "$play_msg"
else
	log "no YouTube tab found; opening a new one -> $URL"
	new_json="$(curl -s -X PUT "http://${HOST}:${PORT}/json/new?${URL}")"
	if ! echo "$new_json" | jq -e '.webSocketDebuggerUrl' >/dev/null 2>&1; then
		new_json="$(curl -s "http://${HOST}:${PORT}/json/new?${URL}")"
	fi
	ws_url="$(echo "$new_json" | jq -r '.webSocketDebuggerUrl // empty')"
	[ -z "$ws_url" ] && { log "could not open a new tab"; exit 1; }
	sleep 3
	ws_send "$ws_url" "$play_msg"
fi

log "done"
