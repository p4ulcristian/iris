"""Maya1 TTS engine for Echo using GGUF quantized model."""

import os
import io
import threading
from pathlib import Path
from typing import Iterator, Optional

import torch
import numpy as np
import soundfile as sf
from llama_cpp import Llama
from snac import SNAC

# Model paths
MODEL_DIR = Path.home() / ".local" / "share" / "echo" / "models"
DEFAULT_MODEL = "maya1.Q5_K_M.gguf"
SNAC_MODEL = "hubertsiuzdak/snac_24khz"

# Sample rate
SAMPLE_RATE = 24000

# SNAC token range
SNAC_TOKEN_START = 128266
SNAC_TOKEN_END = 156937

# Special tokens for Maya1
BOS_TOKEN = 128000
TEXT_EOT_ID = 128009
CODE_START_TOKEN_ID = 128257
CODE_END_TOKEN_ID = 128258
SOH_ID = 128259
EOH_ID = 128260
SOA_ID = 128261

TOKENS_PER_FRAME = 7

# Default settings
DEFAULT_VOICE = "Female voice in the 20s, american accent, energetic, fast pacing."
DEFAULT_TEMPERATURE = 0.4


def _unpack_snac_tokens(tokens: list[int]) -> tuple[list, list, list]:
    """Unpack SNAC tokens to 3 hierarchical levels."""
    snac_tokens = [t for t in tokens if SNAC_TOKEN_START <= t <= SNAC_TOKEN_END]
    n_frames = len(snac_tokens) // TOKENS_PER_FRAME
    snac_tokens = snac_tokens[:n_frames * TOKENS_PER_FRAME]

    if n_frames == 0:
        return [], [], []

    l1, l2, l3 = [], [], []
    for i in range(n_frames):
        slots = snac_tokens[i * 7 : (i + 1) * 7]
        l1.append((slots[0] - SNAC_TOKEN_START) % 4096)
        l2.extend([(slots[1] - SNAC_TOKEN_START) % 4096, (slots[4] - SNAC_TOKEN_START) % 4096])
        l3.extend([(slots[2] - SNAC_TOKEN_START) % 4096, (slots[3] - SNAC_TOKEN_START) % 4096,
                   (slots[5] - SNAC_TOKEN_START) % 4096, (slots[6] - SNAC_TOKEN_START) % 4096])
    return l1, l2, l3


class MayaTTS:
    """Maya1 TTS engine for Echo.

    Uses GGUF quantized model with llama-cpp-python for fast inference.
    """

    def __init__(
        self,
        model_path: Optional[str] = None,
        device: str = "cuda",
        voice: str = DEFAULT_VOICE,
        temperature: float = DEFAULT_TEMPERATURE,
    ):
        """Initialize Maya TTS.

        Args:
            model_path: Path to GGUF model file (default: ~/.local/share/echo/models/maya1.Q5_K_M.gguf)
            device: "cuda" or "cpu" for SNAC decoder
            voice: Default voice description
            temperature: Generation temperature (0.3-0.6 recommended)
        """
        self.model_path = Path(model_path) if model_path else MODEL_DIR / DEFAULT_MODEL
        self.device = device
        self.voice = voice
        self.temperature = temperature
        self.sample_rate = SAMPLE_RATE

        self.llm: Optional[Llama] = None
        self.snac_model = None
        self._torch_device = torch.device(device if torch.cuda.is_available() else "cpu")
        self._ready = False

    @property
    def is_ready(self) -> bool:
        """Check if the engine is loaded and ready."""
        return self._ready

    def _load_engine(self):
        """Load the TTS model (blocking)."""
        print(f"Loading Maya TTS from {self.model_path}...", flush=True)

        if not self.model_path.exists():
            raise FileNotFoundError(f"Model not found: {self.model_path}")

        # Load SNAC decoder
        print("Loading SNAC decoder...", flush=True)
        self.snac_model = SNAC.from_pretrained(SNAC_MODEL).to(self._torch_device).eval()

        # Load GGUF model
        print("Loading Maya1 GGUF model...", flush=True)
        self.llm = Llama(
            model_path=str(self.model_path),
            n_ctx=4096,
            n_gpu_layers=-1,  # Use all GPU layers
            verbose=False,
        )

        self._ready = True
        print("Maya TTS ready", flush=True)

    def _build_prompt_tokens(self, description: str, text: str) -> list[int]:
        """Build prompt tokens in Maya1 format."""
        formatted_text = f'<description="{description}"> {text}'
        text_tokens = self.llm.tokenize(formatted_text.encode("utf-8"), add_bos=False)
        return [SOH_ID, BOS_TOKEN, *text_tokens, TEXT_EOT_ID, EOH_ID, SOA_ID, CODE_START_TOKEN_ID]

    def _decode_snac_to_audio(self, tokens: list[int]) -> np.ndarray:
        """Decode SNAC tokens to audio waveform."""
        l1, l2, l3 = _unpack_snac_tokens(tokens)
        if not l1:
            return np.array([], dtype=np.float32)

        codes = [
            torch.tensor(l1, dtype=torch.long, device=self._torch_device).unsqueeze(0),
            torch.tensor(l2, dtype=torch.long, device=self._torch_device).unsqueeze(0),
            torch.tensor(l3, dtype=torch.long, device=self._torch_device).unsqueeze(0),
        ]

        with torch.no_grad():
            z_q = self.snac_model.quantizer.from_codes(codes)
            audio = self.snac_model.decoder(z_q)

        return audio[0, 0].cpu().numpy()

    def stream(
        self,
        text: str,
        voice: Optional[str] = None,
        stop_event: Optional[threading.Event] = None,
    ) -> Iterator[np.ndarray]:
        """Generate speech, yielding audio chunks.

        Args:
            text: Text to synthesize
            voice: Voice description (uses default if None)
            stop_event: Event to signal early stopping

        Yields:
            numpy arrays of float32 audio samples at 24kHz
        """
        if not text.strip():
            return

        voice = voice or self.voice
        prompt_tokens = self._build_prompt_tokens(voice, text.strip())

        # Generate tokens
        self.llm.reset()
        self.llm.eval(prompt_tokens)

        generated_tokens = []
        token_buffer = []
        frames_per_chunk = 4  # Yield audio every 4 frames (28 tokens)

        for _ in range(2048):
            if stop_event and stop_event.is_set():
                break

            token = self.llm.sample(
                temp=self.temperature,
                top_p=0.9,
                repeat_penalty=1.1,
            )

            if token == CODE_END_TOKEN_ID:
                break

            generated_tokens.append(token)

            # Buffer SNAC tokens for chunked decoding
            if SNAC_TOKEN_START <= token <= SNAC_TOKEN_END:
                token_buffer.append(token)

                # Yield audio chunk every N frames
                if len(token_buffer) >= frames_per_chunk * TOKENS_PER_FRAME:
                    chunk_tokens = token_buffer[-frames_per_chunk * TOKENS_PER_FRAME:]
                    audio_chunk = self._decode_snac_to_audio(chunk_tokens)
                    if len(audio_chunk) > 0:
                        yield audio_chunk.astype(np.float32)

            self.llm.eval([token])

        # Yield remaining audio
        remaining = len(token_buffer) % (frames_per_chunk * TOKENS_PER_FRAME)
        if remaining >= TOKENS_PER_FRAME:
            final_tokens = token_buffer[-(remaining // TOKENS_PER_FRAME * TOKENS_PER_FRAME):]
            final_audio = self._decode_snac_to_audio(final_tokens)
            if len(final_audio) > 0:
                yield final_audio.astype(np.float32)

    def generate(
        self,
        text: str,
        voice: Optional[str] = None,
        speed: float = 1.0,  # Ignored - kept for API compatibility
    ) -> bytes:
        """Generate speech and return WAV bytes.

        Args:
            text: Text to synthesize
            voice: Voice description
            speed: Speech speed (currently ignored)

        Returns:
            WAV audio bytes at 24kHz
        """
        chunks = list(self.stream(text, voice=voice))

        if not chunks:
            return self._empty_wav()

        audio = np.concatenate(chunks)

        buffer = io.BytesIO()
        sf.write(buffer, audio, self.sample_rate, format='WAV', subtype='PCM_16')
        buffer.seek(0)
        return buffer.read()

    def _empty_wav(self) -> bytes:
        """Return empty WAV file bytes."""
        buffer = io.BytesIO()
        sf.write(buffer, np.zeros(1000, dtype=np.float32), self.sample_rate, format='WAV', subtype='PCM_16')
        buffer.seek(0)
        return buffer.read()

    def cleanup(self):
        """Release model and free GPU memory."""
        if self.llm is not None:
            del self.llm
            self.llm = None
        if self.snac_model is not None:
            del self.snac_model
            self.snac_model = None
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        self._ready = False
