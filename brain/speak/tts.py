"""Chatterbox Turbo TTS model wrapper."""

import os
import logging
import time
from pathlib import Path
from typing import Dict, Iterator, Optional

# Must set before any torch imports
os.environ.setdefault("CUDA_DEVICE_ORDER", "PCI_BUS_ID")
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "0")  # RTX 3080 (10GB)

import warnings
warnings.filterwarnings('ignore')

import numpy as np
import torch

# Chatterbox Turbo sample rate
SAMPLE_RATE = 24000

# Voices directory - wav files for voice cloning
VOICES_DIR = Path(__file__).parent / "voices"

# Use Turbo model for faster inference (2.7x realtime vs ~1x for base)
TURBO_REPO_ID = "ResembleAI/chatterbox-turbo"

logger = logging.getLogger(__name__)


class TextToSpeech:
    """Text-to-Speech using Chatterbox Turbo model."""

    def __init__(self):
        print("[TTS] Loading Chatterbox Turbo...", flush=True)

        from chatterbox.tts_turbo import ChatterboxTurboTTS

        self.sample_rate = SAMPLE_RATE

        # Determine device
        if torch.cuda.is_available():
            self.device = "cuda:0"
        else:
            self.device = "cpu"

        print(f"[TTS] Using device={self.device}", flush=True)

        # Load Turbo model (downloads from HuggingFace if needed)
        self.model = ChatterboxTurboTTS.from_pretrained(device=self.device)

        # Load voice presets (wav files)
        self.voice_presets: Dict[str, Path] = {}
        self.default_voice: Optional[str] = None
        self._load_voice_presets()

        print("[TTS] Model ready", flush=True)

    def _load_voice_presets(self) -> None:
        """Load available voice presets (wav files)."""
        if not VOICES_DIR.exists():
            print(f"[TTS] Warning: Voices directory not found: {VOICES_DIR}", flush=True)
            return

        for wav_path in VOICES_DIR.glob("*.wav"):
            self.voice_presets[wav_path.stem] = wav_path

        if self.voice_presets:
            self.voice_presets = dict(sorted(self.voice_presets.items()))
            if "default" in self.voice_presets:
                self.default_voice = "default"
            else:
                self.default_voice = next(iter(self.voice_presets))
            print(f"[TTS] Found {len(self.voice_presets)} voice presets", flush=True)

    def _get_voice_path(self, voice_name: Optional[str] = None) -> Optional[str]:
        """Get path to voice wav file."""
        if not voice_name or voice_name not in self.voice_presets:
            voice_name = self.default_voice

        if voice_name is None:
            return None

        return str(self.voice_presets[voice_name])

    def synthesize(
        self,
        text: str,
        voice: Optional[str] = None,
        cfg_scale: float = 0.5,
    ) -> np.ndarray:
        """
        Synthesize speech from text.

        Args:
            text: Text to synthesize
            voice: Voice preset name (uses default if None)
            cfg_scale: Exaggeration factor (0.25-0.75 recommended, default 0.5)

        Returns:
            Audio as float32 numpy array (values in [-1, 1])
        """
        t0 = time.time()

        text = text.strip().replace("'", "'")
        if not text:
            return np.array([], dtype=np.float32)

        # Get voice path
        voice_path = self._get_voice_path(voice)

        t1 = time.time()
        logger.info(f"[TIMING] Prep took {(t1-t0)*1000:.0f}ms, calling model.generate...")

        # Generate audio
        wav = self.model.generate(
            text,
            audio_prompt_path=voice_path,
            exaggeration=cfg_scale,
        )
        t2 = time.time()
        logger.info(f"[TIMING] model.generate took {(t2-t1)*1000:.0f}ms")

        # Convert to numpy
        if torch.is_tensor(wav):
            audio = wav.detach().cpu().to(torch.float32).numpy()
        else:
            audio = np.asarray(wav, dtype=np.float32)

        if audio.ndim > 1:
            audio = audio.reshape(-1)

        # Normalize
        peak = np.max(np.abs(audio)) if audio.size else 0.0
        if peak > 1.0:
            audio = audio / peak

        return audio

    def synthesize_stream(
        self,
        text: str,
        voice: Optional[str] = None,
        cfg_scale: float = 0.5,
    ) -> Iterator[np.ndarray]:
        """
        Synthesize speech from text, yielding audio chunks.

        Chatterbox Turbo is fast enough (2.7x realtime) that we generate
        full audio and yield it as a single chunk.

        Args:
            text: Text to synthesize
            voice: Voice preset name (uses default if None)
            cfg_scale: Exaggeration factor (0.25-0.75 recommended)

        Yields:
            Audio as float32 numpy array (values in [-1, 1])
        """
        audio = self.synthesize(text, voice=voice, cfg_scale=cfg_scale)
        if audio.size > 0:
            yield audio

    def get_voices(self) -> list:
        """Get list of available voice preset names."""
        return list(self.voice_presets.keys())
