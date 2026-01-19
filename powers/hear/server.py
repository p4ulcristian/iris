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
#     "torch",
#     "torchaudio",
#     "evdev",
#     "requests",
#     "faster-whisper>=1.0.0",
# ]
# ///
"""
Iris Hear Server - STT HTTP API with Push-to-Talk

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

PTT (Push-to-Talk):
  CapsLock hold     - Record and paste at cursor
  Shift+CapsLock    - Record and send to focused god
  CapsLock tap      - Stop TTS playback
"""

import sys
from pathlib import Path

# Add parent to path for base module
sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent))

from flask import request, jsonify
import threading
import os
import tempfile
import requests as http_requests

import soundfile as sf
from audio import AudioRecorder
from capslock import PTTListener
from actions import paste_text, send_to_iris

from base import setup_logging, create_app, run_server

# Setup
logger = setup_logging("hear")
app = create_app(cors=True)

# STT version selection via environment variable
# STT_VERSION=v1 -> Parakeet TDT (English, faster)
# STT_VERSION=v2 -> Whisper large-v3-hu (Hungarian, more accurate)
STT_VERSION = os.environ.get("STT_VERSION", "v2")

STT_AVAILABLE = False
SpeechToText = None

if STT_VERSION == "v2":
    try:
        from stt_v2 import SpeechToText
        STT_AVAILABLE = True
    except ImportError as e:
        print(f"Failed to load Whisper STT: {e}")

if not STT_AVAILABLE and STT_VERSION == "v1":
    try:
        from stt import SpeechToText
        STT_AVAILABLE = True
    except ImportError as e:
        print(f"Failed to load Parakeet STT: {e}")

if not STT_AVAILABLE:
    class SpeechToText:
        """Dummy STT when no model is available"""
        def __init__(self, *args, **kwargs):
            pass
        def transcribe(self, audio):
            return "[STT not installed]"


# Config - ports from ports.json
import json
PORTS = json.loads((Path(__file__).parent.parent.parent / 'ports.json').read_text())
PORT = PORTS['hear']
SPEAK_SERVER = f"http://127.0.0.1:{PORTS['speak']}"

# State
stt_model = None
recorder = None
chronicle = None
ptt_listener = None
is_ready = False
recording_lock = threading.Lock()
ptt_mode = "paste"


def init_models():
    """Initialize STT model on startup."""
    global stt_model, recorder, chronicle, is_ready

    if STT_AVAILABLE:
        version_name = "Faster-Whisper large-v3-hu" if STT_VERSION == "v2" else "Parakeet TDT"
        logger.info(f"Initializing STT model ({version_name})...")
    else:
        logger.warning("STT not available - using dummy")

    stt_model = SpeechToText()
    recorder = AudioRecorder()

    # Initialize chronicle
    try:
        from chronicle import Chronicle
        chronicle = Chronicle(stt_model)
        logger.info("Chronicle initialized")
    except Exception as e:
        logger.warning(f"Chronicle not available: {e}")

    is_ready = True

    if STT_AVAILABLE:
        version_name = "Faster-Whisper large-v3-hu" if STT_VERSION == "v2" else "Parakeet TDT"
        logger.info(f"STT model ready ({version_name})")
    else:
        logger.info("Hear server ready (dummy STT mode)")


def init_ptt():
    """Initialize PTT listener after models are ready."""
    global ptt_listener

    logger.info("Starting PTT listener...")
    ptt_listener = PTTListener(
        on_press=on_ptt_press,
        on_release=on_ptt_release,
        on_tap=on_ptt_tap
    )
    ptt_listener.start()
    logger.info("PTT listener active (CapsLock = record, tap = stop TTS)")


def cleanup():
    """Cleanup on shutdown."""
    if ptt_listener:
        ptt_listener.stop()


# PTT callbacks

def on_ptt_press(mode):
    """Handle CapsLock press - start recording."""
    global ptt_mode
    ptt_mode = mode
    logger.info(f"PTT press (mode={mode})")

    # Pause chronicle during PTT
    if chronicle:
        chronicle.pause()

    # Mute TTS
    try:
        http_requests.post(f"{SPEAK_SERVER}/mute", timeout=1)
    except Exception as e:
        logger.debug(f"Failed to mute speak: {e}")

    # Start recording
    with recording_lock:
        if recorder.stream is None:
            recorder.start()


def on_ptt_release(mode):
    """Handle CapsLock release - stop recording and process."""
    global ptt_mode
    actual_mode = ptt_mode
    logger.info(f"PTT release (mode={actual_mode})")

    def process():
        with recording_lock:
            if recorder.stream is None:
                logger.warning("PTT release but not recording")
                return

            audio = recorder.stop()

            if audio is None or len(audio) == 0:
                logger.warning("No audio recorded")
                text = ""
            else:
                logger.info(f"Transcribing {len(audio)} samples...")
                text = stt_model.transcribe(audio)
                logger.info(f"Transcription: {text}")

        if text:
            if chronicle:
                chronicle.log(text, source="input")

            if actual_mode == "iris":
                send_to_iris(text)
            else:
                paste_text(text)

        # Unmute TTS
        try:
            http_requests.post(f"{SPEAK_SERVER}/unmute", timeout=1)
        except Exception as e:
            logger.debug(f"Failed to unmute speak: {e}")

        # Resume chronicle
        if chronicle:
            chronicle.resume()

    threading.Thread(target=process, daemon=True).start()


def on_ptt_tap():
    """Handle quick CapsLock tap - just stop TTS."""
    logger.info("PTT tap - stopping TTS")
    try:
        http_requests.post(f"{SPEAK_SERVER}/stop", timeout=1)
    except Exception as e:
        logger.debug(f"Failed to stop speak: {e}")


# Routes

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    result = {
        "ready": is_ready,
        "stt_version": STT_VERSION,
        "stt_model": "faster-whisper-large-v3-hu" if STT_VERSION == "v2" else "parakeet-tdt-0.6b-v3"
    }
    if chronicle:
        result["chronicle"] = chronicle.status()
    if ptt_listener:
        result["ptt"] = ptt_listener._running
    return jsonify(result)


@app.route('/start', methods=['POST'])
def start():
    """Start recording."""
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
    """Stop recording and return transcription."""
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
    """Upload audio file and get transcription."""
    if not is_ready:
        return jsonify({"error": "STT model not ready"}), 503

    if 'audio' not in request.files:
        return jsonify({"error": "No audio file provided"}), 400

    audio_file = request.files['audio']

    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        audio_file.save(f.name)
        temp_path = f.name

    try:
        audio, sr = sf.read(temp_path)
        logger.info(f"Transcribing uploaded file ({len(audio)} samples, {sr}Hz)...")

        text = stt_model.transcribe(audio)
        logger.info(f"Transcription: {text}")

        return jsonify({"text": text, "status": "ok"})
    finally:
        os.unlink(temp_path)


@app.route('/listen', methods=['POST'])
def listen():
    """Listen until VAD detects silence, then return transcription.

    This is a blocking call that:
    1. Pauses chronicle (if running)
    2. Mutes TTS
    3. Records until speech is detected, then until silence
    4. Transcribes
    5. Resumes chronicle and unmutes TTS
    6. Returns the transcribed text
    """
    if not is_ready:
        return jsonify({"error": "STT model not ready"}), 503

    import numpy as np
    import sounddevice as sd
    import resampy
    from vad import VAD, SAMPLE_RATE as VAD_SAMPLE_RATE, CHUNK_SIZE as VAD_CHUNK_SIZE
    from audio import get_input_device

    # Config
    SILENCE_THRESHOLD = 1.5  # seconds of silence to end
    MAX_LISTEN_TIME = 30  # max seconds to listen
    MIN_SPEECH_TIME = 0.3  # min seconds of speech to transcribe

    # Pause chronicle during listen
    was_chronicle_running = chronicle and chronicle.running
    if chronicle:
        chronicle.pause()

    # Mute TTS
    try:
        http_requests.post(f"{SPEAK_SERVER}/mute", timeout=1)
    except Exception as e:
        logger.debug(f"Failed to mute speak: {e}")

    try:
        # Setup
        vad = VAD()
        device, native_rate = get_input_device()
        need_resample = native_rate != VAD_SAMPLE_RATE
        record_chunk = int(0.1 * native_rate)  # 100ms chunks

        audio_buffer = []
        all_audio = []
        vad_buffer = np.array([], dtype=np.float32)
        silence_start = None
        has_speech = False
        start_time = __import__('time').time()

        def audio_callback(indata, frames, time_info, status):
            audio_buffer.append(indata.copy())

        logger.info("Listen: waiting for speech...")

        with sd.InputStream(
            samplerate=native_rate,
            channels=1,
            dtype=np.float32,
            blocksize=record_chunk,
            device=device,
            callback=audio_callback
        ):
            while True:
                import time
                elapsed = time.time() - start_time

                # Timeout
                if elapsed > MAX_LISTEN_TIME:
                    logger.info("Listen: timeout reached")
                    break

                if not audio_buffer:
                    time.sleep(0.01)
                    continue

                # Process audio
                audio = np.concatenate(audio_buffer, axis=0).flatten()
                audio_buffer.clear()

                # Resample for VAD
                if need_resample:
                    audio_vad = resampy.resample(audio, native_rate, VAD_SAMPLE_RATE)
                else:
                    audio_vad = audio

                all_audio.append(audio_vad)
                vad_buffer = np.concatenate([vad_buffer, audio_vad])

                # Check VAD
                while len(vad_buffer) >= VAD_CHUNK_SIZE:
                    chunk = vad_buffer[:VAD_CHUNK_SIZE]
                    vad_buffer = vad_buffer[VAD_CHUNK_SIZE:]

                    speech_prob = vad.get_speech_prob(chunk)

                    if speech_prob > 0.5:
                        if not has_speech:
                            logger.info("Listen: speech detected")
                        has_speech = True
                        silence_start = None
                    else:
                        if has_speech and silence_start is None:
                            silence_start = time.time()

                # Check if should stop (had speech, now silence)
                if has_speech and silence_start:
                    silence_duration = time.time() - silence_start
                    if silence_duration > SILENCE_THRESHOLD:
                        logger.info(f"Listen: silence detected ({silence_duration:.1f}s)")
                        break

        # Transcribe
        if all_audio and has_speech:
            full_audio = np.concatenate(all_audio)
            duration = len(full_audio) / VAD_SAMPLE_RATE

            if duration >= MIN_SPEECH_TIME:
                logger.info(f"Listen: transcribing {duration:.1f}s of audio...")
                text = stt_model.transcribe(full_audio)
                logger.info(f"Listen: transcription: {text}")
            else:
                logger.info(f"Listen: audio too short ({duration:.1f}s)")
                text = ""
        else:
            logger.info("Listen: no speech detected")
            text = ""

        return jsonify({"text": text, "status": "ok"})

    finally:
        # Unmute TTS
        try:
            http_requests.post(f"{SPEAK_SERVER}/unmute", timeout=1)
        except Exception as e:
            logger.debug(f"Failed to unmute speak: {e}")

        # Resume chronicle
        if chronicle:
            chronicle.resume()


# Chronicle routes

@app.route('/chronicle/start', methods=['POST'])
def chronicle_start():
    """Start continuous transcription logging."""
    if chronicle is None:
        return jsonify({"error": "Chronicle not available"}), 503

    if chronicle.start():
        return jsonify({"status": "ok", "message": "Chronicle started"})
    else:
        return jsonify({"status": "ok", "message": "Chronicle already running"})


@app.route('/chronicle/stop', methods=['POST'])
def chronicle_stop():
    """Stop continuous transcription logging."""
    if chronicle is None:
        return jsonify({"error": "Chronicle not available"}), 503

    if chronicle.stop():
        return jsonify({"status": "ok", "message": "Chronicle stopped"})
    else:
        return jsonify({"status": "ok", "message": "Chronicle not running"})


@app.route('/chronicle/pause', methods=['POST'])
def chronicle_pause():
    """Pause continuous transcription."""
    if chronicle is None:
        return jsonify({"error": "Chronicle not available"}), 503

    chronicle.pause()
    return jsonify({"status": "ok", "message": "Chronicle paused"})


@app.route('/chronicle/resume', methods=['POST'])
def chronicle_resume():
    """Resume continuous transcription."""
    if chronicle is None:
        return jsonify({"error": "Chronicle not available"}), 503

    chronicle.resume()
    return jsonify({"status": "ok", "message": "Chronicle resumed"})


@app.route('/chronicle/status', methods=['GET'])
def chronicle_status():
    """Get chronicle status."""
    if chronicle is None:
        return jsonify({"error": "Chronicle not available"}), 503

    return jsonify(chronicle.status())


@app.route('/chronicle/log', methods=['POST'])
def chronicle_log():
    """Log external text."""
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
    """Get recent transcript lines."""
    count = request.args.get('count', 5, type=int)

    if chronicle is None:
        return jsonify({"lines": []})

    log_file = chronicle._get_log_file()
    if not log_file.exists():
        return jsonify({"lines": []})

    with open(log_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    recent = lines[-count:] if len(lines) >= count else lines
    return jsonify({"lines": [l.strip() for l in recent]})


@app.route('/chronicle/history', methods=['GET'])
def chronicle_history():
    """Get paginated transcript history."""
    from datetime import datetime
    from chronicle import TRANSCRIPT_DIR

    cursor_str = request.args.get('cursor')
    count = min(request.args.get('count', 20, type=int), 100)
    direction = request.args.get('direction', 'before')

    cursor_dt = None
    if cursor_str:
        try:
            cursor_dt = datetime.fromisoformat(cursor_str)
        except ValueError:
            return jsonify({"error": "Invalid cursor format"}), 400

    if not TRANSCRIPT_DIR.exists():
        return jsonify({"lines": [], "nextCursor": None, "hasMore": False})

    files = sorted(TRANSCRIPT_DIR.glob("*.txt"), reverse=True)
    if not files:
        return jsonify({"lines": [], "nextCursor": None, "hasMore": False})

    def parse_line(line, file_date):
        line = line.strip()
        if not line or not line.startswith('['):
            return None

        try:
            time_end = line.index(']')
            time_str = line[1:time_end]
            rest = line[time_end + 1:].strip()

            source = "ambient"
            text = rest
            if rest.startswith('['):
                src_end = rest.index(']')
                source = rest[1:src_end]
                text = rest[src_end + 1:].strip()

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
        for file_path in files:
            try:
                file_date = datetime.strptime(file_path.stem, "%Y-%m-%d").date()
            except ValueError:
                continue

            if cursor_dt and file_date > cursor_dt.date():
                continue

            with open(file_path, 'r', encoding='utf-8') as f:
                file_lines = f.readlines()

            for line in reversed(file_lines):
                parsed = parse_line(line, file_date)
                if not parsed:
                    continue

                line_dt = datetime.fromisoformat(parsed["timestamp"])

                if cursor_dt and line_dt >= cursor_dt:
                    continue

                results.append(parsed)

                if len(results) >= count:
                    has_more = True
                    next_cursor = parsed["timestamp"]
                    break

            if len(results) >= count:
                break

        if len(results) < count:
            has_more = False
            next_cursor = None
        elif results:
            next_cursor = results[-1]["timestamp"]

    else:
        for file_path in reversed(files):
            try:
                file_date = datetime.strptime(file_path.stem, "%Y-%m-%d").date()
            except ValueError:
                continue

            if cursor_dt and file_date < cursor_dt.date():
                continue

            with open(file_path, 'r', encoding='utf-8') as f:
                file_lines = f.readlines()

            for line in file_lines:
                parsed = parse_line(line, file_date)
                if not parsed:
                    continue

                line_dt = datetime.fromisoformat(parsed["timestamp"])

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


def init_all():
    """Initialize models and PTT."""
    init_models()
    init_ptt()


if __name__ == '__main__':
    run_server(app, PORT, init_fn=init_all, cleanup_fn=cleanup, logger=logger)
