#!/usr/bin/env python3
"""Wake word detector for 'hey iris' - triggers bubble waking state."""

import sys
from pathlib import Path

# Add openwakeword to path
sys.path.insert(0, str(Path(__file__).parent / 'train' / 'openwakeword'))

from openwakeword.model import Model
import numpy as np
import pyaudio
import time
import subprocess

MODEL_PATH = Path(__file__).parent / 'train' / 'hey_iris_model' / 'hey_iris.onnx'
STATE_FILE = Path('/tmp/iris/express-state')
THRESHOLD = 0.85  # High threshold to reduce false positives
COOLDOWN = 3.0  # seconds between detections

def ensure_state_dir():
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)

def set_state(state: str):
    """Write state to bubble state file."""
    ensure_state_dir()
    STATE_FILE.write_text(state)

def speak(text: str):
    """Speak text using brain.say module."""
    iris_dir = Path(__file__).parent.parent.parent
    subprocess.Popen(
        ['python', '-m', 'brain.say', text, '--bg'],
        cwd=str(iris_dir),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

def run_detector(on_wake=None):
    """Run wake word detector. Calls on_wake callback when detected."""
    print('Loading wake word model...', flush=True)
    model = Model(wakeword_models=[str(MODEL_PATH)], inference_framework='onnx')

    p = pyaudio.PyAudio()
    stream = p.open(
        format=pyaudio.paInt16,
        channels=1,
        rate=16000,
        input=True,
        frames_per_buffer=1280
    )

    print('Listening for "hey iris"...', flush=True)

    last_detection = 0

    try:
        while True:
            audio = np.frombuffer(
                stream.read(1280, exception_on_overflow=False),
                dtype=np.int16
            )
            score = model.predict(audio).get('hey_iris', 0)

            now = time.time()
            if score > THRESHOLD and (now - last_detection) > COOLDOWN:
                last_detection = now
                print(f'Wake word detected! (score: {score:.2f})', flush=True)

                if on_wake:
                    on_wake()
                else:
                    # Default: set bubble to waking state and speak
                    set_state('waking')
                    speak("Iris here!")
                    time.sleep(1.5)  # Show waking state briefly
                    set_state('ready')  # Then go back to ready

    except KeyboardInterrupt:
        print('\nStopping detector...', flush=True)
    finally:
        stream.stop_stream()
        stream.close()
        p.terminate()

def main():
    run_detector()

if __name__ == '__main__':
    main()
