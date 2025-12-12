#!/usr/bin/env python3
"""
Iris Speak Server - TTS HTTP API

Dummy implementation for initial testing.
Real TTS (Maya) will be added later.

Endpoints:
  GET  /health  - Health check
  POST /speak   - Speak text (dummy - just logs)
  POST /stop    - Stop playback (no-op for now)
"""

from flask import Flask, request, jsonify
import logging

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
is_ready = True


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({"ready": is_ready})


@app.route('/speak', methods=['POST'])
def speak():
    """Speak text (dummy - just logs for now)"""
    data = request.get_json()

    if not data:
        return jsonify({"error": "No JSON data provided"}), 400

    text = data.get('text', '')
    voice = data.get('voice', 'default')

    if not text:
        return jsonify({"error": "No text provided"}), 400

    logger.info(f"[SPEAK] voice={voice}, text={text}")

    return jsonify({"status": "ok", "text": text})


@app.route('/stop', methods=['POST'])
def stop():
    """Stop playback (no-op for now)"""
    logger.info("[STOP] Playback stopped")
    return jsonify({"status": "ok"})


def main():
    """Start the server"""
    logger.info(f"Starting Iris Speak server on {HOST}:{PORT}")
    logger.info("NOTE: This is a DUMMY implementation - text is only logged, not spoken")

    app.run(
        host=HOST,
        port=PORT,
        debug=False,
        threaded=True
    )


if __name__ == '__main__':
    main()
