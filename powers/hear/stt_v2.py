"""Faster-Whisper large-v3-hu STT - Gyors magyar nyelvű beszédfelismerés."""

import os
import sys
import logging
from pathlib import Path

# Must set before any torch imports
os.environ.setdefault("CUDA_DEVICE_ORDER", "PCI_BUS_ID")
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "0")

# Suppress warnings
logging.disable(logging.WARNING)

import warnings
warnings.filterwarnings('ignore')

import numpy as np

# Model path - local converted model
MODEL_PATH = Path(__file__).parent / "models" / "whisper-large-v3-hu-ct2"
SAMPLE_RATE = 16000


class SpeechToText:
    """Faster-Whisper large-v3-hu for fast Hungarian speech recognition.

    Uses CTranslate2 backend for 4x speedup compared to vanilla Whisper.
    """

    def __init__(self):
        print("Loading STT model (Faster-Whisper large-v3-hu)...", flush=True)

        from faster_whisper import WhisperModel

        # Check if local model exists
        if MODEL_PATH.exists():
            model_path = str(MODEL_PATH)
            print(f"Using local model: {model_path}", flush=True)
        else:
            # Fallback to downloading from HuggingFace
            model_path = "Systran/faster-whisper-large-v3"
            print(f"Local model not found, using: {model_path}", flush=True)

        # Load model with float16 for GPU, int8 for CPU
        import torch
        if torch.cuda.is_available():
            self.model = WhisperModel(
                model_path,
                device="cuda",
                compute_type="float16"
            )
        else:
            self.model = WhisperModel(
                model_path,
                device="cpu",
                compute_type="int8"
            )

        print("STT model ready (Faster-Whisper large-v3-hu)", flush=True)

    def transcribe(self, audio: np.ndarray) -> str:
        """Transcribe audio to Hungarian text.

        Args:
            audio: numpy array of audio samples at 16kHz

        Returns:
            Transcribed text string
        """
        if audio is None or len(audio) == 0:
            return ""

        # Ensure float32
        if audio.dtype != np.float32:
            audio = audio.astype(np.float32)

        # Normalize if needed
        if np.abs(audio).max() > 1.0:
            audio = audio / np.abs(audio).max()

        # Transcribe with Hungarian language hint
        segments, info = self.model.transcribe(
            audio,
            language="hu",
            task="transcribe",
            vad_filter=True,  # Filter out non-speech
            vad_parameters=dict(
                min_silence_duration_ms=500,
            )
        )

        # Collect all segments
        text_parts = []
        for segment in segments:
            text_parts.append(segment.text)

        text = " ".join(text_parts)
        return text.strip() if text else ""
