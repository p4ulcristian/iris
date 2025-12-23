"""PipeWire/PulseAudio audio recording."""
from __future__ import annotations

import json
import numpy as np
import sounddevice as sd
import resampy
from pathlib import Path

TARGET_SAMPLE_RATE = 16000  # Parakeet expects 16kHz
CONFIG_FILE = Path(__file__).parent.parent.parent / "config" / "settings.json"


def get_input_device():
    """Get configured input device from settings. Returns (device_id, native_sample_rate)."""
    try:
        if CONFIG_FILE.exists():
            settings = json.loads(CONFIG_FILE.read_text())
            device_name = settings.get("audio", {}).get("input_device")
            if device_name:
                # Find device by name
                devices = sd.query_devices()
                for i, d in enumerate(devices):
                    if device_name in d["name"] and d["max_input_channels"] > 0:
                        return i, int(d["default_samplerate"])
    except Exception:
        pass
    return None, TARGET_SAMPLE_RATE  # Use default


class AudioRecorder:
    def __init__(self):
        self.buffer: list[np.ndarray] = []
        self.stream = None
        self.device, self.native_rate = get_input_device()

    def _callback(self, indata, frames, time, status):
        self.buffer.append(indata.copy())

    def start(self):
        self.buffer = []
        self.stream = sd.InputStream(
            samplerate=self.native_rate,
            channels=1,
            dtype=np.float32,
            callback=self._callback,
            device=self.device,
        )
        self.stream.start()

    def stop(self) -> np.ndarray | None:
        if self.stream is None:
            return None
        self.stream.stop()
        self.stream.close()
        self.stream = None
        if not self.buffer:
            return None
        audio = np.concatenate(self.buffer, axis=0).flatten()
        # Resample to 16kHz if needed
        if self.native_rate != TARGET_SAMPLE_RATE:
            audio = resampy.resample(audio, self.native_rate, TARGET_SAMPLE_RATE)
        return audio
