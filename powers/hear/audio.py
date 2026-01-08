"""PipeWire/PulseAudio audio recording with echo cancellation."""
from __future__ import annotations

import subprocess
import platform
import logging
import numpy as np
import sounddevice as sd
import resampy

logger = logging.getLogger(__name__)

TARGET_SAMPLE_RATE = 16000  # Parakeet expects 16kHz
ECHO_CANCEL_SOURCE_PACTL = "echo_cancelled_source"  # Name in pactl
ECHO_CANCEL_SOURCE_SD = "Echo-Cancel Source"  # Name in sounddevice


def setup_echo_cancellation():
    """Set up PipeWire/PulseAudio echo cancellation on Linux.

    Returns True if echo cancellation is available, False otherwise.
    """
    if platform.system() != "Linux":
        logger.info("Echo cancellation only available on Linux")
        return False

    try:
        # Check if echo-cancel module already loaded
        result = subprocess.run(
            ["pactl", "list", "sources", "short"],
            capture_output=True, text=True, timeout=5
        )
        if ECHO_CANCEL_SOURCE_PACTL in result.stdout:
            logger.info("Echo cancellation already active")
            return True

        # Find the default source and sink
        sources = subprocess.run(
            ["pactl", "get-default-source"],
            capture_output=True, text=True, timeout=5
        )
        sinks = subprocess.run(
            ["pactl", "get-default-sink"],
            capture_output=True, text=True, timeout=5
        )

        source = sources.stdout.strip()
        sink = sinks.stdout.strip()

        if not source or not sink:
            logger.warning("Could not determine default source/sink")
            return False

        # Load echo-cancel module
        subprocess.run([
            "pactl", "load-module", "module-echo-cancel",
            f"source_name={ECHO_CANCEL_SOURCE_PACTL}",
            f"source_master={source}",
            f"sink_master={sink}",
            "aec_method=webrtc"
        ], capture_output=True, timeout=5)

        logger.info(f"Echo cancellation enabled (source={source}, sink={sink})")
        return True

    except Exception as e:
        logger.warning(f"Could not set up echo cancellation: {e}")
        return False


def get_input_device():
    """Get input device with echo cancellation if available.

    Returns (device_id, native_sample_rate).
    """
    # On Linux, try to use echo-cancelled source
    if platform.system() == "Linux":
        setup_echo_cancellation()

        # Look for echo-cancelled source
        devices = sd.query_devices()
        input_devices = [(i, d["name"]) for i, d in enumerate(devices) if d["max_input_channels"] > 0]
        logger.info(f"Available input devices: {input_devices}")

        for i, d in enumerate(devices):
            if ECHO_CANCEL_SOURCE_SD in d["name"] and d["max_input_channels"] > 0:
                logger.info(f"Using echo-cancelled source: {d['name']}")
                return i, int(d["default_samplerate"])

        logger.warning(f"Echo-cancelled source '{ECHO_CANCEL_SOURCE_SD}' not found")

    # Use system default
    return None, TARGET_SAMPLE_RATE


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
