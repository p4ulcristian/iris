#!/usr/bin/env python3
"""
Iris Hear Server - STT HTTP API

Endpoints:
  GET  /health     - Health check
  POST /start      - Start recording
  POST /stop       - Stop recording and return transcription
  POST /transcribe - Upload audio file and get transcription
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
from stt import SpeechToText

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
is_ready = False
recording_lock = threading.Lock()


def init_models():
    """Initialize STT model on startup"""
    global stt_model, recorder, is_ready

    logger.info("Initializing STT model...")
    stt_model = SpeechToText()
    recorder = AudioRecorder()
    is_ready = True
    logger.info("STT model initialized and ready")


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({"ready": is_ready})


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
