#!/usr/bin/env python3
"""Test the hey_iris wake word model with live microphone input."""

import sys
sys.path.insert(0, 'train/openwakeword')

from openwakeword.model import Model
import numpy as np
import pyaudio

MODEL_PATH = 'train/hey_iris_model/hey_iris.onnx'
THRESHOLD = 0.5

print('Loading model...')
model = Model(wakeword_models=[MODEL_PATH], inference_framework='onnx')

p = pyaudio.PyAudio()
stream = p.open(
    format=pyaudio.paInt16,
    channels=1,
    rate=16000,
    input=True,
    frames_per_buffer=1280
)

print(f'Listening for "hey iris" (threshold={THRESHOLD})')
print('Press Ctrl+C to stop\n')

count = 0
try:
    while True:
        audio = np.frombuffer(stream.read(1280, exception_on_overflow=False), dtype=np.int16)
        score = model.predict(audio).get('hey_iris', 0)
        if score > THRESHOLD:
            count += 1
            print(f'[{count}] HEY IRIS DETECTED! (score: {score:.3f})')
except KeyboardInterrupt:
    print(f'\nTotal detections: {count}')
finally:
    stream.stop_stream()
    stream.close()
    p.terminate()
