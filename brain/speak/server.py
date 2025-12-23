#!/usr/bin/env -S uv run --script --python 3.11
# /// script
# requires-python = ">=3.10,<3.12"
# dependencies = [
#     "flask",
#     "torch",
#     "sounddevice",
#     "setuptools",
#     "resemble-perth",
#     "chatterbox-tts @ git+https://github.com/resemble-ai/chatterbox.git",
# ]
# ///
"""
Iris Speak Server - TTS HTTP API

Uses Chatterbox Turbo for text-to-speech synthesis.

Endpoints:
  GET  /health  - Health check
  POST /speak   - Speak text
  POST /stop    - Stop playback
  GET  /voices  - List available voices
"""

from flask import Flask, request, jsonify
import logging
import threading
import queue
import json
import time
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

# Try to import TTS, fall back to dummy if deps not installed
try:
    from tts import TextToSpeech
    from audio import AudioPlayer
    TTS_AVAILABLE = True
except ImportError as e:
    TTS_AVAILABLE = False
    IMPORT_ERROR = str(e)

    class TextToSpeech:
        """Dummy TTS when vibevoice deps not installed"""
        sample_rate = 24000
        def __init__(self, *args, **kwargs):
            pass
        def synthesize(self, text, voice=None, cfg_scale=1.5):
            import numpy as np
            return np.array([], dtype=np.float32)
        def get_voices(self):
            return []

    class AudioPlayer:
        """Dummy player"""
        def __init__(self, *args, **kwargs):
            pass
        def play(self, audio, blocking=True):
            pass
        def stop(self):
            pass


app = Flask(__name__)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

logger = logging.getLogger(__name__)

# Config
HOST = "127.0.0.1"
PORT = 8765
MAX_QUEUE_SIZE = 30
QUEUE_STATE_FILE = Path("/tmp/iris/speak-queue")
MESSAGE_DISPLAY_TIME = 5.0  # seconds to show each message
WATCHDOG_TIMEOUT = 60.0  # seconds before watchdog considers worker stuck

# State
tts_model = None
player = None
is_ready = False
is_muted = False  # When True, /speak returns immediately without playing

# Queue system
speak_queue = queue.Queue(maxsize=MAX_QUEUE_SIZE)
queue_worker_thread = None
current_message = None  # Currently playing message text
current_message_time = None  # When current message started
displayed_messages = []  # List of {"text": str, "time": float} for bubble display
displayed_messages_lock = threading.Lock()


def write_queue_state():
    """Write current queue state to file for bubble to read."""
    global current_message, displayed_messages

    try:
        QUEUE_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)

        # Get queued messages (peek without removing)
        queued = []
        try:
            # Get a snapshot of queue contents, remove "So, " prefix for display
            with speak_queue.mutex:
                for item in list(speak_queue.queue):
                    text = item["text"]
                    if text.startswith("So, "):
                        text = text[4:]
                    queued.append(text)
        except Exception:
            pass

        # Clean up old displayed messages
        now = time.time()
        with displayed_messages_lock:
            displayed_messages = [
                msg for msg in displayed_messages
                if now - msg["time"] < MESSAGE_DISPLAY_TIME
            ]
            display_list = [{"text": msg["text"], "voice": msg.get("voice")} for msg in displayed_messages]

        state = {
            "playing": current_message,
            "queued": queued,
            "displayed": display_list,
            "timestamp": now
        }

        QUEUE_STATE_FILE.write_text(json.dumps(state))
    except Exception as e:
        logger.warning(f"Failed to write queue state: {e}")


def queue_worker():
    """Worker thread that processes the speak queue."""
    global current_message, current_message_time, tts_model, player

    while True:
        try:
            # Get next item from queue (blocks until available)
            item = speak_queue.get()

            if item is None:  # Shutdown signal
                break

            text = item["text"]
            voice = item.get("voice")

            # Set current message and add to displayed
            current_message = text.replace("So, ", "", 1) if text.startswith("So, ") else text  # Remove warmup prefix for display
            current_message_time = time.time()

            with displayed_messages_lock:
                displayed_messages.append({"text": current_message, "voice": voice, "time": current_message_time})

            write_queue_state()

            if is_muted:
                logger.info(f"[QUEUE] Muted - skipping: {text[:50]}...")
                current_message = None
                speak_queue.task_done()
                write_queue_state()
                continue

            logger.info(f"[QUEUE] Playing: {text[:50]}{'...' if len(text) > 50 else ''}")

            # Synthesize and play
            try:
                audio_iter = tts_model.synthesize_stream(text, voice=voice)
                duration = player.play_stream(audio_iter, blocking=True, trim_prefix=True)
                logger.info(f"[QUEUE] Played {duration:.2f}s of audio")
            except Exception as e:
                logger.error(f"[QUEUE] Playback error: {e}")
                import traceback
                traceback.print_exc()

            current_message = None
            speak_queue.task_done()
            write_queue_state()

        except Exception as e:
            logger.error(f"[QUEUE] Worker error: {e}")
            import traceback
            traceback.print_exc()
            current_message = None


def watchdog():
    """Watchdog thread that monitors the queue worker for hangs."""
    global current_message_time, player

    while True:
        time.sleep(10)  # Check every 10 seconds

        if current_message_time is not None:
            elapsed = time.time() - current_message_time
            if elapsed > WATCHDOG_TIMEOUT:
                logger.warning(f"[WATCHDOG] Worker stuck for {elapsed:.0f}s, forcing stop")
                if player:
                    player.stop()
                # Clear current message to allow queue to continue
                current_message_time = None


def display_cleanup():
    """Periodically clean up old displayed messages."""
    while True:
        time.sleep(1)  # Check every second
        write_queue_state()  # This cleans up old displayed messages


def init_models():
    """Initialize TTS model on startup"""
    global tts_model, player, is_ready, queue_worker_thread

    if TTS_AVAILABLE:
        logger.info("Initializing TTS model...")
    else:
        logger.warning(f"TTS not available ({IMPORT_ERROR}) - using dummy")

    tts_model = TextToSpeech()
    player = AudioPlayer(sample_rate=tts_model.sample_rate)

    # Start queue worker thread
    queue_worker_thread = threading.Thread(target=queue_worker, daemon=True)
    queue_worker_thread.start()
    logger.info("Queue worker started")

    # Start watchdog thread
    watchdog_thread = threading.Thread(target=watchdog, daemon=True)
    watchdog_thread.start()
    logger.info("Watchdog started (timeout: {}s)".format(WATCHDOG_TIMEOUT))

    # Start display cleanup thread
    cleanup_thread = threading.Thread(target=display_cleanup, daemon=True)
    cleanup_thread.start()
    logger.info("Display cleanup started")

    # Warmup: synthesize and play startup announcement
    # This warms up CUDA kernels so first real request is fast
    if TTS_AVAILABLE:
        logger.info("Warming up TTS with startup announcement...")
        try:
            warmup_text = "Iris has been started."
            audio = tts_model.synthesize(warmup_text)
            if audio.size > 0:
                player.play(audio, blocking=True)
            logger.info("Warmup complete")
        except Exception as e:
            logger.warning(f"Warmup failed: {e}")

    is_ready = True
    write_queue_state()

    if TTS_AVAILABLE:
        logger.info("TTS model initialized and ready")
    else:
        logger.info("Speak server ready (dummy TTS mode)")


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({"ready": is_ready})


@app.route('/speak', methods=['POST'])
def speak():
    """Add text to speak queue"""
    global is_muted

    if not is_ready:
        return jsonify({"error": "TTS model not ready"}), 503

    if is_muted:
        logger.info("[SPEAK] Muted - ignoring request")
        return jsonify({"status": "muted", "queued": False})

    data = request.get_json()

    if not data:
        return jsonify({"error": "No JSON data provided"}), 400

    text = data.get('text', '')
    voice = data.get('voice')

    if not text:
        return jsonify({"error": "No text provided"}), 400

    # Prepend filler word to give model warmup runway (fixes bad first syllable)
    text_with_prefix = "So, " + text

    # Try to add to queue
    try:
        speak_queue.put_nowait({"text": text_with_prefix, "voice": voice})
        queue_size = speak_queue.qsize()
        logger.info(f"[SPEAK] Queued ({queue_size} in queue): {text[:50]}{'...' if len(text) > 50 else ''}")
        write_queue_state()
        return jsonify({"status": "queued", "queue_size": queue_size})
    except queue.Full:
        logger.warning(f"[SPEAK] Queue full, rejecting: {text[:50]}...")
        return jsonify({"error": "Queue full", "max_size": MAX_QUEUE_SIZE}), 503


@app.route('/stop', methods=['POST'])
def stop():
    """Stop current playback (skip to next in queue)"""
    global player, current_message

    if player:
        player.stop()
        current_message = None
        write_queue_state()
        logger.info("[STOP] Skipped current message")

    return jsonify({"status": "ok"})


@app.route('/mute', methods=['POST'])
def mute():
    """Mute TTS - stop current playback and ignore new requests"""
    global player, is_muted

    is_muted = True
    if player:
        player.stop()
    logger.info("[MUTE] TTS muted")

    return jsonify({"status": "ok", "muted": True})


@app.route('/unmute', methods=['POST'])
def unmute():
    """Unmute TTS - allow new speak requests"""
    global is_muted

    is_muted = False
    logger.info("[UNMUTE] TTS unmuted")

    return jsonify({"status": "ok", "muted": False})


@app.route('/voices', methods=['GET'])
def voices():
    """List available voices"""
    global tts_model

    if not is_ready or not tts_model:
        return jsonify({"error": "TTS model not ready"}), 503

    voice_list = tts_model.get_voices()
    return jsonify({"voices": voice_list})


def main():
    """Start the server"""
    logger.info(f"Starting Iris Speak server on {HOST}:{PORT}")

    # Initialize models before starting server
    init_models()

    app.run(
        host=HOST,
        port=PORT,
        debug=False,
        threaded=True
    )


if __name__ == '__main__':
    main()
