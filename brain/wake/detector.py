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

import random

MODEL_PATH = Path(__file__).parent / 'train' / 'hey_iris_model' / 'hey_iris.onnx'
STATE_FILE = Path('/tmp/iris/express-state')
CONFIG_FILE = Path(__file__).parent.parent.parent / 'config' / 'settings.json'
THRESHOLD = 0.85  # High threshold to reduce false positives
COOLDOWN = 3.0  # seconds between detections
SAMPLE_RATE = 16000
CHUNK_SIZE = 1280  # ~80ms at 16kHz

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


def speak(text: str):
    """Speak text using brain.say module."""
    iris_dir = Path(__file__).parent.parent.parent
    venv_python = iris_dir / 'brain' / '.venv' / 'bin' / 'python'
    python_cmd = str(venv_python) if venv_python.exists() else 'python'
    subprocess.Popen(
        [python_cmd, '-m', 'brain.say', text, '--bg'],
        cwd=str(iris_dir),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )


def run_detector(on_wake=None):
    """Run wake word detector. Calls on_wake callback when detected."""
    print('Loading wake word model...', flush=True)
    model = Model(wakeword_models=[str(MODEL_PATH)], inference_framework='onnx')

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
                            last_detection = now
                            print(f'Wake word detected! (score: {score:.2f})', flush=True)

                            if on_wake:
                                on_wake()
                            else:
                                # Default: set bubble to waking state and speak
                                set_state('waking')
                                response = random.choice(WAKE_RESPONSES)
                                speak(response)
                                time.sleep(2.5)  # Show waking state while speaking
                                set_state('ready')  # Then go back to ready
                else:
                    time.sleep(0.01)  # Small sleep to prevent busy loop

    except KeyboardInterrupt:
        print('\nStopping detector...', flush=True)

def main():
    run_detector()

if __name__ == '__main__':
    main()
