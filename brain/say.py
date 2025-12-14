#!/usr/bin/env python3
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
import requests
import random
from datetime import datetime

SPEAK_URL = "http://127.0.0.1:8765/speak"

# Friendly name -> actual voice code
VOICE_ALIASES = {
    # English voices
    "emma": "en-Emma_woman",
    "english emma": "en-Emma_woman",
    "grace": "en-Grace_woman",
    "english grace": "en-Grace_woman",
    "carter": "en-Carter_man",
    "english carter": "en-Carter_man",
    "davis": "en-Davis_man",
    "english davis": "en-Davis_man",
    "frank": "en-Frank_man",
    "english frank": "en-Frank_man",
    "mike": "en-Mike_man",
    "english mike": "en-Mike_man",
    # Accented English
    "french": "fr-Spk1_woman",
    "french woman": "fr-Spk1_woman",
    "french man": "fr-Spk0_man",
    "german": "de-Spk1_woman",
    "german woman": "de-Spk1_woman",
    "german man": "de-Spk0_man",
    "italian": "it-Spk0_woman",
    "italian woman": "it-Spk0_woman",
    "italian man": "it-Spk1_man",
    "japanese": "jp-Spk1_woman",
    "japanese woman": "jp-Spk1_woman",
    "japanese man": "jp-Spk0_man",
    "indian": "in-Samuel_man",
    "samuel": "in-Samuel_man",
    "korean": "kr-Spk0_woman",
    "korean woman": "kr-Spk0_woman",
    "korean man": "kr-Spk1_man",
    "dutch": "nl-Spk1_woman",
    "dutch woman": "nl-Spk1_woman",
    "dutch man": "nl-Spk0_man",
    "polish": "pl-Spk1_woman",
    "polish woman": "pl-Spk1_woman",
    "polish man": "pl-Spk0_man",
    "portuguese": "pt-Spk0_woman",
    "portuguese woman": "pt-Spk0_woman",
    "portuguese man": "pt-Spk1_man",
    "spanish": "sp-Spk0_woman",
    "spanish woman": "sp-Spk0_woman",
    "spanish man": "sp-Spk1_man",
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
        text: Text to speak
        voice: Voice name (friendly or full code)
        background: If True, return immediately without waiting for playback
    """
    payload = {"text": text}
    if voice:
        payload["voice"] = resolve_voice(voice)

    def do_request():
        try:
            resp = requests.post(SPEAK_URL, json=payload, timeout=60)
            resp.raise_for_status()
            return True
        except requests.RequestException as e:
            print(f"Speak failed: {e}", file=sys.stderr)
            return False

    if background:
        # Spawn a detached Python subprocess that makes the request
        import json
        payload_json = json.dumps(payload)
        python_code = f"""
import requests
try:
    requests.post('{SPEAK_URL}', json={payload_json}, timeout=60)
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
        sys.exit(1)

    text = sys.argv[1]
    success = say(text, voice, background=background)
    sys.exit(0 if success else 1)
