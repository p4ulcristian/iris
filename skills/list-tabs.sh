#!/usr/bin/env bash
# list-tabs.sh — list every open Chrome/Chromium tab (title + URL) via the
# DevTools Protocol HTTP API on port 9222.
#
# Usage:
#   list-tabs.sh            # human-readable "<title>  ->  <url>" lines
#   list-tabs.sh --json     # raw [{title,url,id}, ...] JSON
#
# Only real page tabs are listed (iframes / service-workers are filtered out).
# REQUIREMENT: Chrome must be running with --remote-debugging-port=9222.
# Requires: curl, jq.
set -euo pipefail

PORT="${CDP_PORT:-9222}"
HOST="${CDP_HOST:-127.0.0.1}"

for dep in curl jq; do
	command -v "$dep" >/dev/null 2>&1 || { echo "list-tabs: missing dependency: $dep" >&2; exit 1; }
done

if ! curl -s --max-time 3 "http://${HOST}:${PORT}/json/version" >/dev/null 2>&1; then
	echo "list-tabs: DevTools endpoint not reachable on ${HOST}:${PORT}." >&2
	echo "list-tabs: start Chrome with --remote-debugging-port=${PORT}" >&2
	exit 1
fi

tabs_json="$(curl -s "http://${HOST}:${PORT}/json")"

if [ "${1:-}" = "--json" ]; then
	echo "$tabs_json" | jq '[ .[] | select(.type=="page") | {title, url, id} ]'
else
	echo "$tabs_json" | jq -r '.[] | select(.type=="page") | "\(.title)\t->\t\(.url)"'
fi
