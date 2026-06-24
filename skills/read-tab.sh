#!/usr/bin/env bash
# read-tab.sh — extract the visible text of an open Chrome tab via the
# DevTools Protocol (port 9222). Finds the first page tab whose title OR url
# contains the given pattern (case-insensitive substring), runs JS in it, and
# prints the rendered text (document.body.innerText).
#
# Usage:
#   read-tab.sh <url-pattern-or-title>
#       e.g. read-tab.sh wikipedia
#            read-tab.sh "youtube.com"
#            read-tab.sh "Fermi paradox"
#
# REQUIREMENT: Chrome must be running with --remote-debugging-port=9222.
# Requires: curl, python3 (uses the sibling cdp.py helper).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${CDP_PORT:-9222}"
HOST="${CDP_HOST:-127.0.0.1}"

pattern="${1:-}"
if [ -z "$pattern" ]; then
	echo "read-tab: usage: read-tab.sh <url-pattern-or-title>" >&2
	exit 2
fi

if ! curl -s --max-time 3 "http://${HOST}:${PORT}/json/version" >/dev/null 2>&1; then
	echo "read-tab: DevTools endpoint not reachable on ${HOST}:${PORT}." >&2
	echo "read-tab: start Chrome with --remote-debugging-port=${PORT}" >&2
	exit 1
fi

# innerText gives the visible, rendered text (respects display:none, <br>, etc.)
JS="(document.body && document.body.innerText) || ''"
exec python3 "${HERE}/cdp.py" eval "$pattern" "$JS"
