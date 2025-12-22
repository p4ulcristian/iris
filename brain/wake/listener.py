#!/usr/bin/env python3
"""
Iris Wake Listener - Attention Coordinator

Listens for CapsLock trigger and coordinates hear/, speak/, express/ servers.
"""

import requests
import threading
import logging
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from ptt import PTTListener
from output import paste_text, send_to_iris, send_enter_to_iris

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

logger = logging.getLogger(__name__)

# Server URLs
SPEAK_SERVER = "http://127.0.0.1:8765"
HEAR_SERVER = "http://127.0.0.1:8766"
EXPRESS_SERVER = "http://127.0.0.1:8767"

# Track current mode
_current_mode = "paste"


def on_capslock_press(mode):
    """Handle CapsLock press - start listening"""
    global _current_mode
    _current_mode = mode

    logger.info(f"CapsLock PRESSED (mode={mode})")

    # Mute TTS - stops current playback AND prevents new speech
    try:
        requests.post(f"{SPEAK_SERVER}/mute", timeout=1)
    except Exception as e:
        logger.warning(f"Failed to mute speak server: {e}")

    # Tell express to show "listening" state
    try:
        requests.post(f"{EXPRESS_SERVER}/state", json={"state": "listening"}, timeout=1)
    except Exception as e:
        logger.warning(f"Failed to update express state: {e}")

    # Start recording
    try:
        requests.post(f"{HEAR_SERVER}/start", timeout=1)
    except Exception as e:
        logger.error(f"Failed to start recording: {e}")


def on_capslock_release(mode):
    """Handle CapsLock release - stop listening and process"""
    global _current_mode
    actual_mode = _current_mode  # Use mode from press time

    logger.info(f"CapsLock RELEASED (mode={actual_mode})")

    def process():
        # Stop recording and get transcription
        try:
            resp = requests.post(f"{HEAR_SERVER}/stop", timeout=10)
            data = resp.json()
            text = data.get("text", "")

            if text:
                logger.info(f"Transcribed: {text}")

                # Output text based on mode
                if actual_mode == "iris":
                    send_to_iris(text)
                else:
                    paste_text(text)
            else:
                logger.warning("No text transcribed")

        except Exception as e:
            logger.error(f"Failed to stop/transcribe: {e}")

        # Tell express to show "ready" state
        try:
            requests.post(f"{EXPRESS_SERVER}/state", json={"state": "ready"}, timeout=1)
        except Exception as e:
            logger.warning(f"Failed to update express state: {e}")

        # Unmute TTS - allow shades to speak again
        try:
            requests.post(f"{SPEAK_SERVER}/unmute", timeout=1)
        except Exception as e:
            logger.warning(f"Failed to unmute speak server: {e}")

    # Process in background thread
    threading.Thread(target=process, daemon=True).start()


def on_capslock_tap():
    """Handle quick CapsLock tap - just stop TTS, no recording"""
    logger.info("CapsLock TAP - stopping TTS")

    # Stop current TTS playback
    try:
        requests.post(f"{SPEAK_SERVER}/stop", timeout=1)
    except Exception as e:
        logger.warning(f"Failed to stop speak server: {e}")


def on_iris_enter():
    """Handle CapsLock+Enter - send Enter to Iris"""
    logger.info("CapsLock+Enter - sending Enter to Iris")
    send_enter_to_iris()


def main():
    """Start the wake listener"""
    logger.info("Starting Iris Wake listener")
    logger.info("Waiting for servers to be ready...")

    # Wait for servers to be ready
    servers = {
        "speak": SPEAK_SERVER,
        "hear": HEAR_SERVER,
        "express": EXPRESS_SERVER
    }

    for name, url in servers.items():
        while True:
            try:
                resp = requests.get(f"{url}/health", timeout=2)
                if resp.json().get("ready"):
                    logger.info(f"{name} server ready")
                    break
            except Exception:
                pass
            import time
            time.sleep(1)

    logger.info("All servers ready - starting PTT listener")

    # Start PTT listener
    listener = PTTListener(
        on_press=on_capslock_press,
        on_release=on_capslock_release,
        on_tap=on_capslock_tap,
        on_enter=on_iris_enter
    )
    listener.start()

    logger.info("Wake listener active")

    # Keep running
    try:
        import time
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        listener.stop()


if __name__ == '__main__':
    main()
