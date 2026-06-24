#!/usr/bin/env bash
# send-to-tab.sh — type a message into a chat/input box of an open Chrome tab
# and send it, via the DevTools Protocol (port 9222).
#
# Finds the first page tab whose title OR url contains <pattern>
# (case-insensitive substring), locates the most likely chat input (a focused
# contenteditable, a <textarea>, or a text/search <input>), fills it with
# <message> using framework-friendly events (so React/Vue inputs register it),
# then sends — first by clicking a visible send button, otherwise by pressing
# Enter.
#
# Usage:
#   send-to-tab.sh <url-pattern-or-title> <message>
#       e.g. send-to-tab.sh chatgpt.com "summarise this page"
#            send-to-tab.sh "claudia" "run the tests"
#
# REQUIREMENT: Chrome must be running with --remote-debugging-port=9222.
# Requires: curl, python3, jq (uses the sibling cdp.py helper).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${CDP_PORT:-9222}"
HOST="${CDP_HOST:-127.0.0.1}"

pattern="${1:-}"
message="${2:-}"
if [ -z "$pattern" ] || [ -z "$message" ]; then
	echo "send-to-tab: usage: send-to-tab.sh <url-pattern-or-title> <message>" >&2
	exit 2
fi

for dep in curl jq python3; do
	command -v "$dep" >/dev/null 2>&1 || { echo "send-to-tab: missing dependency: $dep" >&2; exit 1; }
done

if ! curl -s --max-time 3 "http://${HOST}:${PORT}/json/version" >/dev/null 2>&1; then
	echo "send-to-tab: DevTools endpoint not reachable on ${HOST}:${PORT}." >&2
	echo "send-to-tab: start Chrome with --remote-debugging-port=${PORT}" >&2
	exit 1
fi

# JSON-encode the message so it embeds safely as a JS string literal.
msg_lit="$(jq -Rn --arg m "$message" '$m')"

# JS runs in the tab: pick an input, fill it, fire input events, then send.
read -r -d '' JS <<JSEOF || true
(function(){
  var MSG = ${msg_lit};
  function visible(el){
    if(!el) return false;
    var r = el.getBoundingClientRect();
    var s = getComputedStyle(el);
    return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none';
  }
  // Find the target input: prefer an already-focused editable, else the
  // last (usually bottom-most) visible textarea / contenteditable / text input.
  var box = null;
  var a = document.activeElement;
  if(a && (a.isContentEditable || a.tagName==='TEXTAREA' ||
           (a.tagName==='INPUT' && /text|search/i.test(a.type)))) box = a;
  if(!box){
    var cands = Array.prototype.slice.call(
      document.querySelectorAll('textarea, [contenteditable=""], [contenteditable="true"], input[type="text"], input[type="search"]'))
      .filter(visible);
    box = cands[cands.length-1] || null;
  }
  if(!box) return 'NO_INPUT';
  box.focus();
  if(box.isContentEditable){
    box.textContent = '';
    document.execCommand('insertText', false, MSG);
    if(box.textContent !== MSG) box.textContent = MSG;
    box.dispatchEvent(new InputEvent('input', {bubbles:true, data:MSG, inputType:'insertText'}));
  } else {
    var proto = box.tagName==='TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(box, MSG);
    box.dispatchEvent(new Event('input', {bubbles:true}));
    box.dispatchEvent(new Event('change', {bubbles:true}));
  }
  // Try a real send button first.
  var btn = document.querySelector(
    'button[data-testid*="send" i], button[aria-label*="send" i], button[type="submit"]');
  if(btn && visible(btn) && !btn.disabled){ btn.click(); return 'SENT_BUTTON'; }
  // Fall back to pressing Enter on the input.
  ['keydown','keypress','keyup'].forEach(function(t){
    box.dispatchEvent(new KeyboardEvent(t, {bubbles:true, cancelable:true,
      key:'Enter', code:'Enter', keyCode:13, which:13}));
  });
  if(box.form){ try{ box.form.requestSubmit ? box.form.requestSubmit() : box.form.submit(); }catch(e){} }
  return 'SENT_ENTER';
})()
JSEOF

result="$(python3 "${HERE}/cdp.py" eval "$pattern" "$JS")"
echo "send-to-tab: $result"
[ "$result" = "NO_INPUT" ] && { echo "send-to-tab: could not find an input box in the matched tab" >&2; exit 1; }
exit 0
