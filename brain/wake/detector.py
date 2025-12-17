#!/usr/bin/env python3
"""Wake word detector for 'hey iris' - triggers bubble waking state."""

import sys
import json
from pathlib import Path

# Add openwakeword to path
sys.path.insert(0, str(Path(__file__).parent / 'train' / 'openwakeword'))

from openwakeword.model import Model
import numpy as np
import sounddevice as sd
import resampy
import time
import subprocess
import tempfile
import wave
import requests

import random
import torch

MODEL_PATH = Path(__file__).parent / 'train' / 'hey_iris_model' / 'hey_iris.onnx'
VERIFIER_PATH = Path(__file__).parent / 'voice_samples' / 'verifier.pkl'
STATE_FILE = Path('/tmp/iris/express-state')
CONFIG_FILE = Path(__file__).parent.parent.parent / 'config' / 'settings.json'
THRESHOLD = 0.5  # Sweet spot: Paul's voice ~0.8, background noise ~0.25
VERIFIER_THRESHOLD = 0.3  # Threshold to trigger verifier check
COOLDOWN = 3.0  # seconds between detections
SAMPLE_RATE = 16000
CHUNK_SIZE = 1280  # ~80ms at 16kHz

# VAD settings
VAD_SAMPLE_RATE = 16000
SILENCE_THRESHOLD = 1.5  # seconds of silence to stop recording
MAX_RECORDING_TIME = 30  # max seconds to record
HEAR_SERVER_URL = "http://127.0.0.1:8766"

# Wake responses - Iris's personality shines through
WAKE_RESPONSES = [
    "I'm here, Paul. What's on your mind?",
    "You called? I'm listening.",
    "Iris here. Ready when you are.",
    "Hey! What can I do for you?",
    "At your service. What do you need?",
    "I heard you. Go ahead.",
    "Present and ready. What's up?",
    "You have my attention.",
]


def get_input_device():
    """Get configured input device from settings. Returns (device_id, native_sample_rate)."""
    try:
        if CONFIG_FILE.exists():
            settings = json.loads(CONFIG_FILE.read_text())
            device_name = settings.get("audio", {}).get("input_device")
            if device_name:
                devices = sd.query_devices()
                for i, d in enumerate(devices):
                    if device_name in d["name"] and d["max_input_channels"] > 0:
                        native_rate = int(d["default_samplerate"])
                        print(f'Using audio device: {d["name"]} @ {native_rate}Hz', flush=True)
                        return i, native_rate
    except Exception as e:
        print(f'Error reading audio config: {e}', flush=True)
    return None, SAMPLE_RATE  # Use defaults


def ensure_state_dir():
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)


def set_state(state: str):
    """Write state to bubble state file."""
    ensure_state_dir()
    STATE_FILE.write_text(state)


def speak(text: str, blocking: bool = True):
    """Speak text using brain.say module.

    Args:
        text: Text to speak
        blocking: If True, wait for speech to complete before returning
    """
    iris_dir = Path(__file__).parent.parent.parent
    venv_python = iris_dir / 'brain' / '.venv' / 'bin' / 'python'
    python_cmd = str(venv_python) if venv_python.exists() else 'python'

    cmd = [python_cmd, '-m', 'brain.say', text]
    if not blocking:
        cmd.append('--bg')

    if blocking:
        # Wait for TTS to complete
        subprocess.run(
            cmd,
            cwd=str(iris_dir),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
    else:
        subprocess.Popen(
            cmd,
            cwd=str(iris_dir),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )


def load_vad_model():
    """Load silero VAD model."""
    model, utils = torch.hub.load(
        repo_or_dir='snakers4/silero-vad',
        model='silero_vad',
        force_reload=False,
        onnx=False
    )
    return model


def record_with_vad(vad_model, device, native_rate):
    """Record audio until silence is detected using VAD.

    Returns audio as int16 numpy array at 16kHz.
    """
    need_resample = native_rate != VAD_SAMPLE_RATE

    # Use larger chunks for recording, process VAD in 512-sample windows
    record_chunk = int(0.1 * native_rate)  # 100ms chunks for recording

    audio_buffer = []
    all_audio = []
    vad_buffer = np.array([], dtype=np.float32)  # Buffer for VAD processing
    silence_start = None
    speech_detected = False
    start_time = time.time()

    def audio_callback(indata, frames, time_info, status):
        audio_buffer.append(indata.copy())

    print('Recording... (speak now)', flush=True)

    with sd.InputStream(
        samplerate=native_rate,
        channels=1,
        dtype=np.float32,
        blocksize=record_chunk,
        device=device,
        callback=audio_callback
    ):
        while True:
            elapsed = time.time() - start_time

            # Timeout check
            if elapsed > MAX_RECORDING_TIME:
                print('Max recording time reached', flush=True)
                break

            if audio_buffer:
                # Process buffered audio
                audio = np.concatenate(audio_buffer, axis=0).flatten()
                audio_buffer.clear()

                # Resample to 16kHz if needed
                if need_resample:
                    audio = resampy.resample(audio, native_rate, VAD_SAMPLE_RATE)

                all_audio.append(audio)

                # Add to VAD buffer
                vad_buffer = np.concatenate([vad_buffer, audio])

                # Process VAD in 512-sample chunks
                while len(vad_buffer) >= 512:
                    chunk = vad_buffer[:512]
                    vad_buffer = vad_buffer[512:]

                    audio_tensor = torch.from_numpy(chunk).float()
                    speech_prob = vad_model(audio_tensor, VAD_SAMPLE_RATE).item()

                    if speech_prob > 0.5:
                        speech_detected = True
                        silence_start = None
                    elif speech_detected:
                        # Started detecting silence after speech
                        if silence_start is None:
                            silence_start = time.time()
                        elif time.time() - silence_start > SILENCE_THRESHOLD:
                            print('Silence detected, stopping', flush=True)
                            break
                else:
                    continue
                break  # Exit outer loop if inner loop broke
            else:
                time.sleep(0.01)

    if not all_audio:
        return None

    # Combine all audio
    full_audio = np.concatenate(all_audio)

    # Convert to int16
    audio_int16 = (full_audio * 32767).astype(np.int16)
    return audio_int16


def save_audio_to_wav(audio_int16, filepath):
    """Save int16 audio to WAV file."""
    with wave.open(str(filepath), 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(audio_int16.tobytes())


def transcribe_audio(audio_int16):
    """Send audio to hear server for transcription."""
    # Save to temp file
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        temp_path = f.name

    try:
        save_audio_to_wav(audio_int16, temp_path)

        # Send to hear server
        with open(temp_path, 'rb') as f:
            response = requests.post(
                f"{HEAR_SERVER_URL}/transcribe",
                files={'audio': f},
                timeout=30
            )

        if response.status_code == 200:
            return response.json().get('text', '')
        else:
            print(f'Transcription error: {response.status_code}', flush=True)
            return None
    except requests.exceptions.ConnectionError:
        print('Hear server not running', flush=True)
        return None
    except Exception as e:
        print(f'Transcription error: {e}', flush=True)
        return None
    finally:
        Path(temp_path).unlink(missing_ok=True)


def send_to_iris(text: str):
    """Send text to master Iris pane via tmux."""
    if not text or not text.strip():
        return False

    try:
        # Send text literally (handles special chars)
        subprocess.run(
            ['tmux', 'send-keys', '-t', 'iris:0.0', '-l', text.strip()],
            check=True,
            capture_output=True
        )
        # Send Enter separately
        subprocess.run(
            ['tmux', 'send-keys', '-t', 'iris:0.0', 'Enter'],
            check=True,
            capture_output=True
        )
        print(f'Sent to Iris: {text.strip()}', flush=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f'Failed to send to Iris: {e}', flush=True)
        return False


def handle_wake(vad_model, device, native_rate):
    """Handle wake word detection: record, transcribe, send to Iris."""
    # Visual feedback - bubble animation starts with recording
    set_state('listening')

    # Record with VAD
    audio = record_with_vad(vad_model, device, native_rate)

    if audio is None or len(audio) == 0:
        print('No audio recorded', flush=True)
        set_state('ready')
        return

    set_state('thinking')

    # Transcribe
    text = transcribe_audio(audio)

    if text:
        # Send to Iris
        send_to_iris(text)
    else:
        print('No transcription returned', flush=True)

    set_state('ready')


def run_detector(on_wake=None):
    """Run wake word detector. Calls on_wake callback when detected."""
    print('Loading wake word model...', flush=True)

    # Check if verifier exists
    verifier_models = {}
    if VERIFIER_PATH.exists():
        print(f'Using custom verifier: {VERIFIER_PATH}', flush=True)
        verifier_models['hey_iris'] = str(VERIFIER_PATH)
    else:
        print('No custom verifier found, using base model only', flush=True)

    model = Model(
        wakeword_models=[str(MODEL_PATH)],
        inference_framework='onnx',
        custom_verifier_models=verifier_models,
        custom_verifier_threshold=VERIFIER_THRESHOLD
    )

    # Load VAD model
    print('Loading VAD model...', flush=True)
    vad_model = load_vad_model()
    print('VAD model loaded', flush=True)

    device, native_rate = get_input_device()
    need_resample = native_rate != SAMPLE_RATE

    # Adjust chunk size for native sample rate
    native_chunk = int(CHUNK_SIZE * native_rate / SAMPLE_RATE)

    print(f'Listening for "hey iris"... (threshold={THRESHOLD})', flush=True)

    last_detection = 0
    audio_buffer = []

    def audio_callback(indata, frames, time_info, status):
        """Called by sounddevice for each audio chunk."""
        audio_buffer.append(indata.copy())

    try:
        with sd.InputStream(
            samplerate=native_rate,
            channels=1,
            dtype=np.float32,  # Use float32 for resampling compatibility
            blocksize=native_chunk,
            device=device,
            callback=audio_callback
        ):
            while True:
                if audio_buffer:
                    # Process all buffered audio
                    audio = np.concatenate(audio_buffer, axis=0).flatten()
                    audio_buffer.clear()

                    # Resample to 16kHz if needed
                    if need_resample:
                        audio = resampy.resample(audio, native_rate, SAMPLE_RATE)

                    # Convert to int16 for the model
                    audio_int16 = (audio * 32767).astype(np.int16)

                    # Process in chunks
                    for i in range(0, len(audio_int16) - CHUNK_SIZE + 1, CHUNK_SIZE):
                        chunk = audio_int16[i:i + CHUNK_SIZE]
                        score = model.predict(chunk).get('hey_iris', 0)

                        now = time.time()
                        if score > THRESHOLD and (now - last_detection) > COOLDOWN:
                            print(f'Wake word detected! (score: {score:.2f})', flush=True)

                            if on_wake:
                                on_wake()
                            else:
                                # Handle wake: record, transcribe, send to Iris
                                handle_wake(vad_model, device, native_rate)

                            # Clear buffer and reset after handling
                            audio_buffer.clear()
                            model.reset()  # Reset model state
                            last_detection = time.time()  # Reset cooldown AFTER handling
                            break  # Break inner loop to avoid processing stale audio
                else:
                    time.sleep(0.01)  # Small sleep to prevent busy loop

    except KeyboardInterrupt:
        print('\nStopping detector...', flush=True)

def main():
    run_detector()

if __name__ == '__main__':
    main()
