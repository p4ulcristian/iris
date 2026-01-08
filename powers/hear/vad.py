"""Silero VAD wrapper for voice activity detection."""

import numpy as np
import torch
import logging

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16000
CHUNK_SIZE = 512  # ~32ms at 16kHz


class VAD:
    """Voice Activity Detection using Silero VAD model."""

    def __init__(self):
        logger.info("Loading Silero VAD model...")
        self.model, _ = torch.hub.load(
            repo_or_dir='snakers4/silero-vad',
            model='silero_vad',
            force_reload=False,
            onnx=False,
            verbose=False
        )
        self.model.eval()
        logger.info("Silero VAD model loaded")

    def is_speech(self, audio_chunk: np.ndarray, threshold: float = 0.5) -> bool:
        """Check if audio chunk contains speech.

        Args:
            audio_chunk: Audio samples as float32 numpy array (16kHz)
            threshold: Speech probability threshold (0-1)

        Returns:
            True if speech detected, False otherwise
        """
        if len(audio_chunk) < CHUNK_SIZE:
            return False

        audio_tensor = torch.from_numpy(audio_chunk[:CHUNK_SIZE]).float()
        speech_prob = self.model(audio_tensor, SAMPLE_RATE).item()
        return speech_prob > threshold

    def get_speech_prob(self, audio_chunk: np.ndarray) -> float:
        """Get speech probability for audio chunk.

        Args:
            audio_chunk: Audio samples as float32 numpy array (16kHz)

        Returns:
            Speech probability (0-1)
        """
        if len(audio_chunk) < CHUNK_SIZE:
            return 0.0

        audio_tensor = torch.from_numpy(audio_chunk[:CHUNK_SIZE]).float()
        return self.model(audio_tensor, SAMPLE_RATE).item()

    def reset(self):
        """Reset VAD model state."""
        self.model.reset_states()
