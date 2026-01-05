#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "flask",
#     "flask-cors",
#     "numpy",
#     "sounddevice",
#     "soundfile",
#     "resampy",
#     "nemo_toolkit[asr]",
#     "torch",
#     "torchaudio",
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
from flask_cors import CORS
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
CORS(app)

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


@app.route('/chronicle/recent', methods=['GET'])
def chronicle_recent():
    """Get recent transcript lines"""
    global chronicle

    count = request.args.get('count', 5, type=int)

    # Get today's transcript file
    if chronicle is None:
        return jsonify({"lines": []})

    log_file = chronicle._get_log_file()
    if not log_file.exists():
        return jsonify({"lines": []})

    # Read last N lines
    with open(log_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    recent = lines[-count:] if len(lines) >= count else lines
    return jsonify({"lines": [l.strip() for l in recent]})


@app.route('/chronicle/history', methods=['GET'])
def chronicle_history():
    """Get paginated transcript history with cursor-based navigation.

    Query params:
        cursor: ISO timestamp (e.g., "2026-01-05T16:38:08") - omit for newest
        count: Number of lines to fetch (default 20, max 100)
        direction: "before" (older) or "after" (newer), default "before"
    """
    from datetime import datetime
    from chronicle import TRANSCRIPT_DIR

    cursor_str = request.args.get('cursor')
    count = min(request.args.get('count', 20, type=int), 100)
    direction = request.args.get('direction', 'before')

    # Parse cursor
    cursor_dt = None
    if cursor_str:
        try:
            cursor_dt = datetime.fromisoformat(cursor_str)
        except ValueError:
            return jsonify({"error": "Invalid cursor format"}), 400

    # Get all transcript files sorted by date (newest first)
    if not TRANSCRIPT_DIR.exists():
        return jsonify({"lines": [], "nextCursor": None, "hasMore": False})

    files = sorted(TRANSCRIPT_DIR.glob("*.txt"), reverse=True)
    if not files:
        return jsonify({"lines": [], "nextCursor": None, "hasMore": False})

    def parse_line(line, file_date):
        """Parse a transcript line into structured data."""
        line = line.strip()
        if not line:
            return None

        # Format: [HH:MM:SS] [input] text  or  [HH:MM:SS] text
        if not line.startswith('['):
            return None

        try:
            # Extract timestamp
            time_end = line.index(']')
            time_str = line[1:time_end]
            rest = line[time_end + 1:].strip()

            # Parse source if present
            source = "ambient"
            text = rest
            if rest.startswith('['):
                src_end = rest.index(']')
                source = rest[1:src_end]
                text = rest[src_end + 1:].strip()

            # Build full timestamp
            h, m, s = map(int, time_str.split(':'))
            full_ts = datetime(file_date.year, file_date.month, file_date.day, h, m, s)

            return {
                "timestamp": full_ts.isoformat(),
                "source": source,
                "text": text
            }
        except (ValueError, IndexError):
            return None

    results = []
    next_cursor = None
    has_more = False

    if direction == 'before':
        # Going backwards in time (scroll up to load older)
        for file_path in files:
            try:
                file_date = datetime.strptime(file_path.stem, "%Y-%m-%d").date()
            except ValueError:
                continue

            # Skip files newer than cursor date
            if cursor_dt and file_date > cursor_dt.date():
                continue

            # Read and parse file
            with open(file_path, 'r', encoding='utf-8') as f:
                file_lines = f.readlines()

            # Process lines in reverse (newest first within file)
            for line in reversed(file_lines):
                parsed = parse_line(line, file_date)
                if not parsed:
                    continue

                line_dt = datetime.fromisoformat(parsed["timestamp"])

                # Skip lines at or after cursor
                if cursor_dt and line_dt >= cursor_dt:
                    continue

                results.append(parsed)

                if len(results) >= count:
                    # Check if there's more
                    has_more = True
                    next_cursor = parsed["timestamp"]
                    break

            if len(results) >= count:
                break

        # Check if we might have more history
        if len(results) < count:
            has_more = False
            next_cursor = None
        elif results:
            next_cursor = results[-1]["timestamp"]

    else:  # direction == 'after'
        # Going forward in time (poll for new entries)
        for file_path in reversed(files):  # oldest first
            try:
                file_date = datetime.strptime(file_path.stem, "%Y-%m-%d").date()
            except ValueError:
                continue

            # Skip files older than cursor date
            if cursor_dt and file_date < cursor_dt.date():
                continue

            with open(file_path, 'r', encoding='utf-8') as f:
                file_lines = f.readlines()

            for line in file_lines:
                parsed = parse_line(line, file_date)
                if not parsed:
                    continue

                line_dt = datetime.fromisoformat(parsed["timestamp"])

                # Skip lines at or before cursor
                if cursor_dt and line_dt <= cursor_dt:
                    continue

                results.append(parsed)

                if len(results) >= count:
                    has_more = True
                    break

            if len(results) >= count:
                break

        next_cursor = results[-1]["timestamp"] if results else None

    return jsonify({
        "lines": results,
        "nextCursor": next_cursor,
        "hasMore": has_more
    })


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
