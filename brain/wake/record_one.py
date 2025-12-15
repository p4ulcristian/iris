#!/usr/bin/env python3
"""Record a single voice sample with countdown."""

import sys
import json
import wave
import time
import numpy as np
import sounddevice as sd
from pathlib import Path

CONFIG_FILE = Path(__file__).parent.parent.parent / 'config' / 'settings.json'
SAMPLES_DIR = Path(__file__).parent / 'voice_samples'
SAMPLE_RATE = 16000


def get_input_device():
    """Get configured input device from settings."""
    try:
        if CONFIG_FILE.exists():
            settings = json.loads(CONFIG_FILE.read_text())
            device_name = settings.get("audio", {}).get("input_device")
            if device_name:
                devices = sd.query_devices()
                for i, d in enumerate(devices):
                    if device_name in d["name"] and d["max_input_channels"] > 0:
                        return i, int(d["default_samplerate"])
    except Exception:
        pass
    return None, SAMPLE_RATE


def speak(text: str):
    """Speak text aloud."""
    import subprocess
    iris_dir = Path(__file__).parent.parent.parent
    venv_python = iris_dir / 'brain' / '.venv' / 'bin' / 'python'
    subprocess.run([str(venv_python), '-m', 'brain.say', text], cwd=str(iris_dir))


def record_and_save(sample_type: str, index: int, duration: float = 2.5):
    """Record and save a single sample."""
    import resampy

    device, native_rate = get_input_device()

    # Create output directory
    output_dir = SAMPLES_DIR / sample_type
    output_dir.mkdir(parents=True, exist_ok=True)

    # Spoken countdown
    speak(f"Sample {index}. 3, 2, 1, speak now")

    # Record
    audio = sd.rec(
        int(duration * native_rate),
        samplerate=native_rate,
        channels=1,
        dtype=np.float32,
        device=device
    )
    sd.wait()
    print("Done!", flush=True)

    # Resample to 16kHz
    audio = audio.flatten()
    if native_rate != SAMPLE_RATE:
        audio = resampy.resample(audio, native_rate, SAMPLE_RATE)

    # Convert to int16
    audio_int16 = (audio * 32767).astype(np.int16)

    # Save
    filepath = output_dir / f"{sample_type}_{index:02d}.wav"
    with wave.open(str(filepath), 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(audio_int16.tobytes())

    print(f"Saved: {filepath}", flush=True)
    return filepath


def play_sample(filepath: str):
    """Play a sample."""
    with wave.open(filepath, 'rb') as wf:
        audio = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16)
        sd.play(audio.astype(np.float32) / 32767, SAMPLE_RATE)
        sd.wait()


def count_samples(sample_type: str) -> int:
    """Count existing samples."""
    dir_path = SAMPLES_DIR / sample_type
    if not dir_path.exists():
        return 0
    return len(list(dir_path.glob("*.wav")))


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python record_one.py <positive|negative> [play <file>]")
        sys.exit(1)

    if sys.argv[1] == 'play' and len(sys.argv) > 2:
        play_sample(sys.argv[2])
    elif sys.argv[1] == 'count':
        sample_type = sys.argv[2] if len(sys.argv) > 2 else 'positive'
        print(count_samples(sample_type))
    else:
        sample_type = sys.argv[1]
        index = count_samples(sample_type) + 1
        filepath = record_and_save(sample_type, index)
