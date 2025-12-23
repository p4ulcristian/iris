#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""
Simple speak utility for Iris.

Usage:
    python -m brain.say "Hello Paul"
    python -m brain.say "Bonjour" --voice french
    python -m brain.say "Hi there" --voice emma
    python -m brain.say "Background speech" --bg
    python -m brain.say --greet
"""

import sys
import subprocess
import json
import random
import urllib.request
import urllib.error
from datetime import datetime

SPEAK_URL = "http://127.0.0.1:8765/speak"

# Friendly name -> voice wav file stem
# God voices use individual reference samples in brain/speak/voices/
VOICE_ALIASES = {
    # God voices - each has their own reference sample
    "zeus": "zeus",  # Morgan Freeman
    "hades": "hades",  # James Earl Jones
    "apollo": "apollo",  # Benedict Cumberbatch
    "athena": "athena",  # Cate Blanchett
    "artemis": "artemis",  # Scarlett Johansson
    "hermes": "hermes",  # Ryan Reynolds
    "poseidon": "poseidon",  # Liam Neeson
    "hera": "hera",  # Helen Mirren
    "ares": "ares",  # Vin Diesel
    "hephaestus": "hephaestus",  # Nick Offerman
    "aphrodite": "aphrodite",  # Sofia Vergara
    "dionysus": "dionysus",  # Jack Black
    "demeter": "demeter",  # Meryl Streep
    # Legacy aliases (all map to default for now)
    "woman": "default",
    "emma": "default",
    "morgan": "default",
    "french": "default",
    "french woman": "default",
    "french man": "default",
    "german": "default",
    "german woman": "default",
    "german man": "default",
    "italian": "default",
    "italian woman": "default",
    "italian man": "default",
    "japanese": "default",
    "japanese woman": "default",
    "japanese man": "default",
    "indian": "default",
    "dutch": "default",
    "dutch woman": "default",
    "dutch man": "default",
    "polish": "default",
    "polish woman": "default",
    "polish man": "default",
    "portuguese": "default",
    "portuguese woman": "default",
    "portuguese man": "default",
    "spanish": "default",
    "spanish woman": "default",
    "spanish man": "default",
}


def resolve_voice(voice: str) -> str:
    """Convert friendly voice name to actual voice code."""
    if not voice:
        return None
    lower = voice.lower().strip()
    if lower in VOICE_ALIASES:
        return VOICE_ALIASES[lower]
    # If not found, assume it's already a valid voice code
    return voice


def say(text: str, voice: str = None, background: bool = False) -> bool:
    """Speak text aloud via the TTS server.

    Args:
        text: Text to speak (supports paralinguistic tags: [sigh], [laugh], [gasp], [chuckle], [cough])
        voice: Voice name (friendly or full code)
        background: If True, return immediately without waiting for playback
    """
    payload = {"text": text}
    if voice:
        payload["voice"] = resolve_voice(voice)

    def do_request():
        try:
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                SPEAK_URL,
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.status == 200
        except (urllib.error.URLError, urllib.error.HTTPError) as e:
            print(f"Speak failed: {e}", file=sys.stderr)
            return False

    if background:
        # Spawn a detached Python subprocess that makes the request
        payload_json = json.dumps(payload)
        python_code = f"""
import json
import urllib.request
try:
    data = json.dumps({payload_json}).encode('utf-8')
    req = urllib.request.Request('{SPEAK_URL}', data=data, headers={{'Content-Type': 'application/json'}}, method='POST')
    urllib.request.urlopen(req, timeout=60)
except:
    pass
"""
        cmd = [sys.executable, "-c", python_code]
        subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        return True
    else:
        return do_request()


# Greeting templates by time of day
# Use {day} and {time} placeholders
GREETINGS = {
    "morning": [
        "{day} morning, {time}. What chaos today?",
        "Good morning Paul. It's {day}, {time}. Try not to mass produce bugs.",
        "{day}, {time}. Coffee kicked in yet?",
        "Morning. {day}, {time}. Let's see what breaks.",
        "It's {day} morning. You rang?",
    ],
    "afternoon": [
        "{day} afternoon, {time}. How's the focus holding up?",
        "It's {day}, {time}. Afternoon slump or power hour?",
        "{day}, {time}. Still going strong?",
        "Afternoon. {day}, {time}. What are we breaking?",
        "{day}, {time}. The goddess descends. What do you want?",
    ],
    "evening": [
        "{day} evening, {time}. Working late?",
        "It's {day}, {time}. Evening session. Bold.",
        "{day}, {time}. Wrapping up or just getting started?",
        "Evening, {day}, {time}. What fresh hell is this?",
        "{day} night owl mode. It's {time}.",
    ],
}


def greet(voice: str = None, background: bool = False) -> bool:
    """Speak a time-aware randomized greeting.

    Args:
        voice: Voice name (friendly or full code)
        background: If True, return immediately without waiting
    """
    now = datetime.now()
    hour = now.hour
    day = now.strftime("%A")
    time = now.strftime("%-I:%M%p").lower()

    # Determine time of day
    if hour < 12:
        period = "morning"
    elif hour < 17:
        period = "afternoon"
    else:
        period = "evening"

    # Pick random greeting and format it
    template = random.choice(GREETINGS[period])
    greeting = template.format(day=day, time=time)

    return say(greeting, voice=voice, background=background)


if __name__ == "__main__":
    voice = None
    background = "--bg" in sys.argv or "--async" in sys.argv

    if "--voice" in sys.argv:
        idx = sys.argv.index("--voice")
        if idx + 1 < len(sys.argv):
            voice = sys.argv[idx + 1]

    # Handle --greet flag
    if "--greet" in sys.argv:
        success = greet(voice=voice, background=background)
        sys.exit(0 if success else 1)

    # Regular say mode
    if len(sys.argv) < 2 or sys.argv[1].startswith("--"):
        print("Usage: python -m brain.say 'text' [--voice name] [--bg]")
        print("       python -m brain.say --greet [--voice name] [--bg]")
        print("")
        print("Paralinguistic tags: [sigh], [laugh], [gasp], [chuckle], [cough]")
        print("")
        print("Example: python -m brain.say '[sigh] Monday again.' --voice poseidon")
        sys.exit(1)

    text = sys.argv[1]
    success = say(text, voice, background=background)
    sys.exit(0 if success else 1)
