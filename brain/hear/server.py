#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "flask",
#     "numpy",
#     "sounddevice",
#     "soundfile",
#     "resampy",
#     "nemo_toolkit[asr]",
#     "torch",
# ]
# ///
"""
Iris Hear Server - STT HTTP API

Endpoints:
  GET  /health     - Health check
  POST /start      - Start recording
  POST /stop       - Stop recording and return transcription
  POST /transcribe - Upload audio file and get transcription

Chronicle (continuous transcription):
  POST /chronicle/start  - Start continuous VAD-driven logging
  POST /chronicle/stop   - Stop continuous logging
  POST /chronicle/pause  - Temporarily pause (for PTT)
  POST /chronicle/resume - Resume after PTT
  GET  /chronicle/status - Get chronicle status
  POST /chronicle/log    - Log external text (PTT inputs)
"""

from flask import Flask, request, jsonify
import logging
import threading
import os
import tempfile
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

import soundfile as sf
from audio import AudioRecorder

# Try to import STT, fall back to dummy if nemo not installed
try:
    from stt import SpeechToText
    STT_AVAILABLE = True
except ImportError:
    STT_AVAILABLE = False
    class SpeechToText:
        """Dummy STT when nemo is not installed"""
        def __init__(self, *args, **kwargs):
            pass
        def transcribe(self, audio):
            return "[STT not installed - install nemo_toolkit[asr]]"

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
PORT = 8766

# State
stt_model = None
recorder = None
chronicle = None
is_ready = False
recording_lock = threading.Lock()


def init_models():
    """Initialize STT model on startup"""
    global stt_model, recorder, chronicle, is_ready

    if STT_AVAILABLE:
        logger.info("Initializing STT model...")
    else:
        logger.warning("STT not available (nemo not installed) - using dummy")

    stt_model = SpeechToText()
    recorder = AudioRecorder()

    # Initialize chronicle with shared STT model
    try:
        from chronicle import Chronicle
        chronicle = Chronicle(stt_model)
        logger.info("Chronicle initialized")
    except Exception as e:
        logger.warning(f"Chronicle not available: {e}")
        chronicle = None

    is_ready = True

    if STT_AVAILABLE:
        logger.info("STT model initialized and ready")
    else:
        logger.info("Hear server ready (dummy STT mode)")


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    result = {"ready": is_ready}
    if chronicle:
        result["chronicle"] = chronicle.status()
    return jsonify(result)


@app.route('/start', methods=['POST'])
def start():
    """Start recording"""
    global recorder

    if not is_ready:
        return jsonify({"error": "STT model not ready"}), 503

    with recording_lock:
        if recorder.stream is not None:
            return jsonify({"error": "Already recording"}), 400

        logger.info("Starting recording...")
        recorder.start()

    return jsonify({"status": "ok", "recording": True})


@app.route('/stop', methods=['POST'])
def stop():
    """Stop recording and return transcription"""
    global recorder, stt_model

    if not is_ready:
        return jsonify({"error": "STT model not ready"}), 503

    with recording_lock:
        if recorder.stream is None:
            return jsonify({"error": "Not recording"}), 400

        logger.info("Stopping recording...")
        audio = recorder.stop()

        if audio is None or len(audio) == 0:
            logger.warning("No audio recorded")
            return jsonify({"text": "", "status": "ok"})

        logger.info(f"Transcribing {len(audio)} samples...")
        text = stt_model.transcribe(audio)
        logger.info(f"Transcription: {text}")

    return jsonify({"text": text, "status": "ok"})


@app.route('/transcribe', methods=['POST'])
def transcribe():
    """Upload audio file and get transcription"""
    global stt_model

    if not is_ready:
        return jsonify({"error": "STT model not ready"}), 503

    if 'audio' not in request.files:
        return jsonify({"error": "No audio file provided"}), 400

    audio_file = request.files['audio']

    # Save to temp file
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        audio_file.save(f.name)
        temp_path = f.name

    try:
        # Read audio
        audio, sr = sf.read(temp_path)
        logger.info(f"Transcribing uploaded file ({len(audio)} samples, {sr}Hz)...")

        # Transcribe
        text = stt_model.transcribe(audio)
        logger.info(f"Transcription: {text}")

        return jsonify({"text": text, "status": "ok"})

    finally:
        os.unlink(temp_path)


# Chronicle endpoints

@app.route('/chronicle/start', methods=['POST'])
def chronicle_start():
    """Start continuous transcription logging"""
    global chronicle

    if chronicle is None:
        return jsonify({"error": "Chronicle not available"}), 503

    if chronicle.start():
        return jsonify({"status": "ok", "message": "Chronicle started"})
    else:
        return jsonify({"status": "ok", "message": "Chronicle already running"})


@app.route('/chronicle/stop', methods=['POST'])
def chronicle_stop():
    """Stop continuous transcription logging"""
    global chronicle

    if chronicle is None:
        return jsonify({"error": "Chronicle not available"}), 503

    if chronicle.stop():
        return jsonify({"status": "ok", "message": "Chronicle stopped"})
    else:
        return jsonify({"status": "ok", "message": "Chronicle not running"})


@app.route('/chronicle/pause', methods=['POST'])
def chronicle_pause():
    """Pause continuous transcription (for PTT)"""
    global chronicle

    if chronicle is None:
        return jsonify({"error": "Chronicle not available"}), 503

    chronicle.pause()
    return jsonify({"status": "ok", "message": "Chronicle paused"})


@app.route('/chronicle/resume', methods=['POST'])
def chronicle_resume():
    """Resume continuous transcription (after PTT)"""
    global chronicle

    if chronicle is None:
        return jsonify({"error": "Chronicle not available"}), 503

    chronicle.resume()
    return jsonify({"status": "ok", "message": "Chronicle resumed"})


@app.route('/chronicle/status', methods=['GET'])
def chronicle_status():
    """Get chronicle status"""
    global chronicle

    if chronicle is None:
        return jsonify({"error": "Chronicle not available"}), 503

    return jsonify(chronicle.status())


@app.route('/chronicle/log', methods=['POST'])
def chronicle_log():
    """Log external text (PTT inputs)"""
    global chronicle

    if chronicle is None:
        return jsonify({"error": "Chronicle not available"}), 503

    data = request.get_json() or {}
    text = data.get("text", "")
    source = data.get("source", "input")

    if not text:
        return jsonify({"error": "No text provided"}), 400

    chronicle.log(text, source=source)
    return jsonify({"status": "ok", "message": "Logged"})


def main():
    """Start the server"""
    logger.info(f"Starting Iris Hear server on {HOST}:{PORT}")

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
