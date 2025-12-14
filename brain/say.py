#!/usr/bin/env python3
"""
Simple speak utility for Iris.

Usage:
    python -m brain.say "Hello Paul"
    python -m brain.say "Bonjour" --voice french
    python -m brain.say "Hi there" --voice emma
"""

import sys
import requests

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


def say(text: str, voice: str = None) -> bool:
    """Speak text aloud via the TTS server."""
    payload = {"text": text}
    if voice:
        payload["voice"] = resolve_voice(voice)

    try:
        resp = requests.post(SPEAK_URL, json=payload, timeout=30)
        resp.raise_for_status()
        return True
    except requests.RequestException as e:
        print(f"Speak failed: {e}", file=sys.stderr)
        return False


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m brain.say 'text' [--voice voice_name]")
        sys.exit(1)

    text = sys.argv[1]
    voice = None

    if "--voice" in sys.argv:
        idx = sys.argv.index("--voice")
        if idx + 1 < len(sys.argv):
            voice = sys.argv[idx + 1]

    success = say(text, voice)
    sys.exit(0 if success else 1)
