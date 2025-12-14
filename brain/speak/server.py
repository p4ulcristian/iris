#!/usr/bin/env python3
"""
Iris Speak Server - TTS HTTP API

Uses VibeVoice for text-to-speech synthesis.

Endpoints:
  GET  /health  - Health check
  POST /speak   - Speak text
  POST /stop    - Stop playback
  GET  /voices  - List available voices
"""

from flask import Flask, request, jsonify
import logging
import threading
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

# State
tts_model = None
player = None
is_ready = False
speak_lock = threading.Lock()


def init_models():
    """Initialize TTS model on startup"""
    global tts_model, player, is_ready

    if TTS_AVAILABLE:
        logger.info("Initializing TTS model...")
    else:
        logger.warning(f"TTS not available ({IMPORT_ERROR}) - using dummy")

    tts_model = TextToSpeech()
    player = AudioPlayer(sample_rate=tts_model.sample_rate)
    is_ready = True

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
    """Speak text"""
    global tts_model, player

    if not is_ready:
        return jsonify({"error": "TTS model not ready"}), 503

    data = request.get_json()

    if not data:
        return jsonify({"error": "No JSON data provided"}), 400

    text = data.get('text', '')
    voice = data.get('voice')
    cfg_scale = data.get('cfg_scale', 1.5)
    stream = data.get('stream', True)  # Streaming with 500ms pre-buffer

    if not text:
        return jsonify({"error": "No text provided"}), 400

    logger.info(f"[SPEAK] voice={voice}, stream={stream}, text={text[:50]}{'...' if len(text) > 50 else ''}")

    with speak_lock:
        if stream:
            # Streaming mode - lower latency
            audio_iter = tts_model.synthesize_stream(text, voice=voice, cfg_scale=cfg_scale)
            duration = player.play_stream(audio_iter, blocking=True)
        else:
            # Non-streaming mode - generate all then play
            audio = tts_model.synthesize(text, voice=voice, cfg_scale=cfg_scale)

            if audio.size == 0:
                logger.warning("No audio generated")
                return jsonify({"status": "ok", "duration_seconds": 0})

            duration = audio.size / tts_model.sample_rate
            player.play(audio, blocking=True)

        logger.info(f"[SPEAK] Played {duration:.2f}s of audio")

    return jsonify({"status": "ok", "duration_seconds": round(duration, 2)})


@app.route('/stop', methods=['POST'])
def stop():
    """Stop playback"""
    global player

    if player:
        player.stop()
        logger.info("[STOP] Playback stopped")

    return jsonify({"status": "ok"})


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
