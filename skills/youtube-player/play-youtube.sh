#!/usr/bin/env bash
# play-youtube.sh — play a YouTube video in the iris YouTube player.
#
# Usage: play-youtube.sh <youtube-url | video-id>
#
# Extracts the 11-char video id from common YouTube URL forms (or accepts a
# bare id), makes sure the player server + app window are running, then calls
# the server's /play endpoint.
#
# Accepted forms:
#   https://www.youtube.com/watch?v=VIDEOID[&...]
#   https://youtu.be/VIDEOID[?...]
#   https://www.youtube.com/embed/VIDEOID
#   https://www.youtube.com/shorts/VIDEOID
#   VIDEOID        (bare 11-char id)

set -euo pipefail

PORT="${IRIS_YT_PORT:-8745}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
URL="http://localhost:${PORT}"

log() { echo "play-youtube: $*" >&2; }

arg="${1:-}"
if [ -z "$arg" ]; then
	log "usage: play-youtube.sh <youtube-url | video-id>"
	exit 1
fi

# --- extract the video id ---------------------------------------------------
extract_id() {
	local s="$1" id=""
	if [[ "$s" =~ ^[A-Za-z0-9_-]{11}$ ]]; then
		echo "$s"; return 0
	fi
	# v= query param
	if [[ "$s" =~ [?\&]v=([A-Za-z0-9_-]{11}) ]]; then
		echo "${BASH_REMATCH[1]}"; return 0
	fi
	# youtu.be/ID , /embed/ID , /shorts/ID , /v/ID
	if [[ "$s" =~ (youtu\.be/|/embed/|/shorts/|/v/)([A-Za-z0-9_-]{11}) ]]; then
		echo "${BASH_REMATCH[2]}"; return 0
	fi
	return 1
}

VIDEO_ID="$(extract_id "$arg")" || {
	log "could not extract a video id from: $arg"
	exit 1
}
log "video id: ${VIDEO_ID}"

# --- ensure server + browser are running ------------------------------------
server_up() { curl -s --max-time 2 "${URL}/health" >/dev/null 2>&1; }

if ! server_up; then
	log "player not running — starting it"
	bash "${HERE}/start.sh"
	# give the page a moment to load the IFrame API before the first command
	for _ in $(seq 1 25); do
		server_up && break
		sleep 0.2
	done
	sleep 1.5
fi

# --- play -------------------------------------------------------------------
resp="$(curl -s --max-time 5 "${URL}/play?v=${VIDEO_ID}")" || {
	log "failed to reach player at ${URL}"
	exit 1
}
log "server: ${resp}"
echo "playing ${VIDEO_ID}"
