"""Unified Echo server - STT (NeMo) + TTS (Maya) with HTTP API."""

import os
import sys
import signal
import logging
import tempfile
import threading
import queue
import subprocess
import time
import socket
import json as jsonlib
from pathlib import Path

# Suppress NeMo logging spam before imports
os.environ['NEMO_LOG_LEVEL'] = 'ERROR'
os.environ['HYDRA_FULL_ERROR'] = '0'
logging.disable(logging.WARNING)

import warnings
warnings.filterwarnings('ignore')

# Suppress stdout/stderr during imports
_stdout, _stderr = sys.stdout, sys.stderr
sys.stdout = sys.stderr = open(os.devnull, 'w')

import torch
import numpy as np
import soundfile as sf
from flask import Flask, request, jsonify
from nemo.collections.asr.models import EncDecMultiTaskModel

sys.stdout, sys.stderr = _stdout, _stderr
logging.disable(logging.NOTSET)

# Suppress Flask/Werkzeug logs
logging.getLogger('werkzeug').setLevel(logging.ERROR)

from echo.audio import AudioRecorder
from echo.output import paste_text
from echo.ptt import PTTListener
from echo.maya_tts import MayaTTS

# Config
HOST = "127.0.0.1"
PORT = 8765
PID_FILE = Path("/tmp/echo.pid")
STATE_FILE = Path("/tmp/echo-state")


def set_state(state: str):
    """Update state file for bubble to read."""
    try:
        STATE_FILE.write_text(state)
    except Exception:
        pass

# Maya TTS config
MAYA_VOICE = "Female, in her 30s with an American accent, warm timbre, conversational pacing"
MAYA_VOLUME = 70  # Default volume (0-100)
MPV_SOCKET = "/tmp/echo-mpv-socket"  # For real-time volume control

# STT config
STT_MODEL = "nvidia/canary-1b-v2"
STT_SAMPLE_RATE = 16000

app = Flask(__name__)


def _quiet():
    """Context manager to suppress stdout/stderr."""
    class Quiet:
        def __enter__(self):
            self._stdout, self._stderr = sys.stdout, sys.stderr
            sys.stdout = sys.stderr = open(os.devnull, 'w')
            return self
        def __exit__(self, *args):
            sys.stdout, sys.stderr = self._stdout, self._stderr
    return Quiet()


bubble_process = None  # Track bubble overlay process

# Bubble config
BUBBLE_SCRIPT = Path(__file__).parent / "bubble.py"


def start_bubble():
    """Start the bubble overlay."""
    global bubble_process
    print("Starting bubble overlay...", flush=True)
    env = os.environ.copy()
    env['LD_PRELOAD'] = '/usr/lib/libgtk4-layer-shell.so'
    bubble_process = subprocess.Popen(
        ['python3', str(BUBBLE_SCRIPT)],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True
    )
    print("Bubble overlay started", flush=True)


def stop_bubble():
    """Stop the bubble overlay if we started it."""
    global bubble_process
    if bubble_process is not None:
        print("Stopping bubble overlay...", flush=True)
        try:
            os.killpg(os.getpgid(bubble_process.pid), signal.SIGTERM)
        except (ProcessLookupError, OSError):
            pass
        bubble_process = None


class EchoServer:
    def __init__(self, load_stt=True, load_tts=True):
        self.stt_model = None
        self.stt_ready = threading.Event()
        self.tts_engine = None
        self.tts_ready = threading.Event()
        self.recorder = AudioRecorder()
        self.recording = False
        self.volume = MAYA_VOLUME  # Current volume level
        self.device = "auto"  # Audio output device
        self._mpv_proc = None  # Current mpv process for volume control

        # Audio playback queue
        self._audio_queue = queue.Queue()
        self._playback_thread = threading.Thread(target=self._playback_worker, daemon=True)
        self._playback_thread.start()

        # Track CapsLock state to block new speech while held
        self.caps_lock_held = False

        # Load TTS model first (blocking), then STT
        # Loading sequentially to avoid memory issues
        if load_tts:
            self._tts_thread = threading.Thread(target=self._load_models_sequential, daemon=True)
            self._tts_thread.start()
        elif load_stt:
            self._stt_thread = threading.Thread(target=self._load_stt_model, daemon=True)
            self._stt_thread.start()

    def _load_models_sequential(self):
        """Load TTS first, then STT to avoid memory spikes."""
        self._load_tts_model()
        self._load_stt_model()

    def _playback_worker(self):
        """Background thread that plays audio from the queue."""
        while True:
            item = self._audio_queue.get()
            if item is None:  # Poison pill to clear queue
                self._audio_queue.task_done()
                continue

            # Wait for CapsLock to be released before playing
            while self.caps_lock_held:
                time.sleep(0.1)

            audio_bytes = item
            try:
                set_state("speaking")
                # Clean up old socket
                if os.path.exists(MPV_SOCKET):
                    os.remove(MPV_SOCKET)
                with tempfile.NamedTemporaryFile(suffix='.wav', delete=True) as f:
                    f.write(audio_bytes)
                    f.flush()
                    # Start mpv with IPC socket for real-time volume control
                    mpv_cmd = [
                        'mpv', '--no-video', '--really-quiet',
                        f'--volume={self.volume}',
                        f'--input-ipc-server={MPV_SOCKET}',
                    ]
                    if self.device and self.device != "auto":
                        mpv_cmd.append(f'--audio-device={self.device}')
                    mpv_cmd.append(f.name)
                    proc = subprocess.Popen(mpv_cmd)
                    self._mpv_proc = proc
                    # Wait a moment for socket to be created, then set volume
                    time.sleep(0.05)
                    self._send_mpv_volume(self.volume)
                    proc.wait()
                    self._mpv_proc = None
                # Brief pause between clips
                time.sleep(0.3)
            except Exception as e:
                print(f"Playback error: {e}", flush=True)
            finally:
                set_state("ready")
                self._audio_queue.task_done()

    def _send_mpv_volume(self, vol):
        """Send volume command to mpv via IPC socket."""
        try:
            if not os.path.exists(MPV_SOCKET):
                return
            sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            sock.connect(MPV_SOCKET)
            cmd = jsonlib.dumps({"command": ["set_property", "volume", vol]}) + "\n"
            sock.send(cmd.encode())
            sock.close()
        except Exception:
            pass

    def set_volume(self, vol):
        """Set volume and update currently playing audio."""
        self.volume = max(0, min(100, vol))
        self._send_mpv_volume(self.volume)

    def stop_playback(self):
        """Stop all speech - kill mpv and clear queue."""
        # Kill any running mpv processes
        subprocess.run(['pkill', '-9', 'mpv'], capture_output=True)
        # Clear the queue
        while not self._audio_queue.empty():
            try:
                self._audio_queue.get_nowait()
                self._audio_queue.task_done()
            except queue.Empty:
                break

    def queue_speak(self, text: str, voice: str = MAYA_VOICE, speed: float = 1.0):
        """Request TTS from Maya and queue for playback."""
        # Don't queue new speech while CapsLock is held (user is speaking)
        if self.caps_lock_held:
            return

        import re
        # Remove backslash escape sequences (e.g. \n \t \r) and stray backslashes
        text = re.sub(r'\\[nrt]', ' ', text)
        text = re.sub(r'\\', '', text)
        # Replace whitespace and collapse spaces
        text = re.sub(r'[\n\r\t]+', ' ', text)
        text = re.sub(r' +', ' ', text).strip()
        if not text:
            return

        # Convert ALL CAPS words to Title Case (prevents spelling them out)
        # Keep short words (3 chars or less) as-is since they're likely real acronyms (API, CPU, etc.)
        def fix_caps(match):
            word = match.group(0)
            if len(word) <= 3:
                return word  # Keep short acronyms
            return word.capitalize()
        text = re.sub(r'\b[A-Z]{2,}\b', fix_caps, text)

        try:
            if not self.tts_ready.wait(timeout=5):
                print("TTS not ready yet", flush=True)
                return
            if self.tts_engine is None:
                print("TTS engine not loaded", flush=True)
                return
            audio_bytes = self.tts_engine.generate(text, voice=voice, speed=speed)
            self._audio_queue.put(audio_bytes)
        except Exception as e:
            print(f"TTS error: {e}", flush=True)

    def _load_tts_model(self):
        """Load Maya TTS model."""
        set_state("loading:tts")
        print("Loading TTS model (Maya)...", flush=True)
        try:
            self.tts_engine = MayaTTS(memory_util=0.6, tp=1)  # 0.8 needed for standalone, 0.6 when sharing with STT
            self.tts_engine._load_engine()  # Blocking load
            print("🔊 Ready to speak", flush=True)
        except Exception as e:
            print(f"TTS failed to load: {e}", flush=True)
            import traceback
            traceback.print_exc()
            self.tts_engine = None
        finally:
            self.tts_ready.set()

    def _load_stt_model(self):
        set_state("loading:stt")
        print("Loading STT model (Canary)...", flush=True)
        try:
            with _quiet():
                self.stt_model = EncDecMultiTaskModel.from_pretrained(STT_MODEL, map_location='cpu')
                self.stt_model = self.stt_model.half().cuda()
                self.stt_model.eval()
            print("STT ready", flush=True)
            print("👂 Ready to listen", flush=True)
        except Exception as e:
            print(f"STT failed to load: {e}", flush=True)
            self.stt_model = None
        finally:
            set_state("ready")
            self.stt_ready.set()

    def cleanup(self):
        """Release models and free CUDA memory."""
        print("Cleaning up models...", flush=True)
        if self.stt_model is not None:
            del self.stt_model
            self.stt_model = None
        if self.tts_engine is not None:
            del self.tts_engine
            self.tts_engine = None
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        print("Cleanup complete", flush=True)

    def transcribe(self, audio: np.ndarray) -> str:
        """Transcribe audio to text. Blocks until STT model is ready."""
        if not self.stt_ready.wait(timeout=60):
            print("STT model not ready", flush=True)
            return ""
        if self.stt_model is None:
            return ""
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=True) as f:
            sf.write(f.name, audio, STT_SAMPLE_RATE)
            with _quiet():
                result = self.stt_model.transcribe([f.name], source_lang='en', target_lang='en', verbose=False)
        if result and len(result) > 0:
            hyp = result[0]
            text = hyp.text if hasattr(hyp, 'text') else str(hyp)
            return text.strip()
        return ""

    def start_recording(self):
        if self.recording:
            return
        self.recording = True
        print("Recording...", flush=True)
        self.recorder.start()

    def stop_recording(self) -> str:
        if not self.recording:
            return ""
        self.recording = False
        print("Processing...", flush=True)
        audio = self.recorder.stop()
        if audio is not None and len(audio) > 0:
            text = self.transcribe(audio)
            if text:
                print(f"Transcribed: {text}")
                return text
        return ""


# Global server instance
server = None


@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "stt_ready": server.stt_ready.is_set() if server else False
    })


@app.route('/speak', methods=['POST'])
def speak():
    """TTS endpoint. POST {"text": "...", "voice": "...", "speed": 1.0, "volume": 70} -> queues audio"""
    data = request.get_json()
    if not data or 'text' not in data:
        return jsonify({"error": "missing 'text' field"}), 400

    text = data['text']
    voice = data.get('voice', MAYA_VOICE)
    speed = data.get('speed', 1.0)
    server.queue_speak(text, voice=voice, speed=speed)
    return jsonify({"status": "queued"})


@app.route('/volume', methods=['GET', 'POST'])
def volume():
    """Get or set the default volume. POST {"volume": 0-100}"""
    if request.method == 'GET':
        return jsonify({"volume": server.volume})
    data = request.get_json()
    if data and 'volume' in data:
        server.set_volume(int(data['volume']))
        print(f"Volume set to {server.volume}%", flush=True)
    return jsonify({"volume": server.volume})


@app.route('/device', methods=['GET', 'POST'])
def device():
    """Get or set the audio output device. POST {"device": "device_id"}"""
    if request.method == 'GET':
        return jsonify({"device": server.device})
    data = request.get_json()
    if data and 'device' in data:
        server.device = data['device']
        print(f"Audio device set to: {server.device}", flush=True)
    return jsonify({"device": server.device})


@app.route('/listen', methods=['POST'])
def listen():
    """STT endpoint. POST audio file -> {"text": "..."}"""
    if 'audio' not in request.files:
        return jsonify({"error": "missing 'audio' file"}), 400

    audio_file = request.files['audio']
    audio_data, sr = sf.read(audio_file)

    # Resample if needed
    if sr != STT_SAMPLE_RATE:
        import librosa
        audio_data = librosa.resample(audio_data, orig_sr=sr, target_sr=STT_SAMPLE_RATE)

    text = server.transcribe(audio_data.astype(np.float32))
    return jsonify({"text": text})


@app.route('/ptt/start', methods=['POST'])
def ptt_start():
    """Start push-to-talk recording."""
    server.start_recording()
    return jsonify({"status": "recording"})


@app.route('/ptt/stop', methods=['POST'])
def ptt_stop():
    """Stop recording and transcribe."""
    text = server.stop_recording()
    if text:
        paste_text(text)
    return jsonify({"text": text})


# Track current PTT mode
_ptt_mode = "paste"


def send_to_iris(text: str):
    """Send text to master Iris tmux pane."""
    try:
        # Escape special characters for tmux
        escaped = text.replace("'", "'\"'\"'")
        subprocess.run(
            ['tmux', 'send-keys', '-t', 'iris:master.0', escaped, 'Enter'],
            capture_output=True,
            timeout=5
        )
        print(f"Sent to Iris: {text}", flush=True)
    except subprocess.TimeoutExpired:
        print("Failed to send to Iris: timeout", flush=True)
    except Exception as e:
        print(f"Failed to send to Iris: {e}", flush=True)


def handle_ptt_press(mode="paste"):
    """CapsLock press - stop any speech and start recording."""
    global _ptt_mode
    _ptt_mode = mode
    server.caps_lock_held = True
    server.stop_playback()
    server.start_recording()


def handle_ptt_release(mode="paste"):
    """CapsLock release - stop and transcribe in background."""
    global _ptt_mode
    actual_mode = _ptt_mode  # Use mode from press time
    server.caps_lock_held = False
    audio = server.recorder.stop() if server.recording else None
    server.recording = False

    def process():
        if audio is not None and len(audio) > 0:
            text = server.transcribe(audio)
            if text:
                print(f"Transcribed: {text}")
                if actual_mode == "iris":
                    send_to_iris(text)
                else:
                    paste_text(text)

    threading.Thread(target=process, daemon=True).start()


def handle_iris_enter():
    """CapsLock+Enter - push Enter to master Iris tmux pane."""
    try:
        subprocess.run(
            ['tmux', 'send-keys', '-t', 'iris:master.0', 'Enter'],
            capture_output=True,
            timeout=5
        )
        print("Pushed Enter to Iris", flush=True)
    except subprocess.TimeoutExpired:
        print("Failed to push Enter to Iris: timeout", flush=True)
    except Exception as e:
        print(f"Failed to push Enter to Iris: {e}", flush=True)


def shutdown(signum, frame):
    print("\nShutting down...", flush=True)
    if server:
        server.cleanup()
    stop_bubble()
    PID_FILE.unlink(missing_ok=True)
    STATE_FILE.unlink(missing_ok=True)
    sys.exit(0)


def main():
    global server

    # Write PID file
    PID_FILE.write_text(str(os.getpid()))

    # Set loading state and start bubble FIRST
    set_state("loading")
    start_bubble()

    ptt_listener = None
    try:
        # Load STT and TTS models (will set state to "ready" when done)
        server = EchoServer()

        # Start PTT listener (evdev-based, no device grab)
        ptt_listener = PTTListener(
            on_press=handle_ptt_press,
            on_release=handle_ptt_release,
            on_enter=handle_iris_enter
        )
        ptt_listener.start()

        print(f"Echo server running on http://{HOST}:{PORT}", flush=True)
        print("Hold CapsLock to record", flush=True)

        # Run Flask in a background thread so main thread handles signals
        flask_thread = threading.Thread(
            target=lambda: app.run(host=HOST, port=PORT, threaded=True, use_reloader=False),
            daemon=True
        )
        flask_thread.start()

        # Main thread waits for signals
        signal.signal(signal.SIGTERM, shutdown)
        signal.signal(signal.SIGINT, shutdown)
        signal.pause()
    finally:
        if ptt_listener:
            ptt_listener.stop()
        if server:
            server.cleanup()
        stop_bubble()
        PID_FILE.unlink(missing_ok=True)
        STATE_FILE.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
