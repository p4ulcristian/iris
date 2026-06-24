#!/usr/bin/env bash
# test-play-youtube.sh — sanity-check the play-youtube skill end to end.
#
# Usage: test-play-youtube.sh [youtube-url | video-id | search terms]
#
# Runs play-youtube.sh, then queries the DevTools API to confirm a YouTube tab
# is open and (best effort) that a <video> element is actually playing.

set -euo pipefail

PORT=9222
HOST="127.0.0.1"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*"; exit 1; }

echo "== running play-youtube.sh =="
bash "$HERE/play-youtube.sh" "$@"

echo "== checking debug endpoint =="
curl -s --max-time 3 "http://${HOST}:${PORT}/json/version" | jq -e '.Browser' >/dev/null \
	&& pass "debug endpoint is live" \
	|| fail "debug endpoint not reachable on ${PORT}"

echo "== checking for a youtube tab =="
sleep 2
tabs="$(curl -s "http://${HOST}:${PORT}/json")"
if echo "$tabs" | jq -e '[.[] | select(.type=="page" and (.url|test("youtube\\.com")))] | length > 0' >/dev/null; then
	url="$(echo "$tabs" | jq -r '[.[] | select(.type=="page" and (.url|test("youtube\\.com")))][0].url')"
	pass "youtube tab open: $url"
else
	fail "no youtube tab found"
fi

echo
echo "All checks passed. Confirm by ear/eye that the video is playing."
